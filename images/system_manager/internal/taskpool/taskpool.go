// Package taskpool bounds how many task.Task Runs can execute at the
// same instant, across this whole process — scheduled runs (see
// internal/schedule.Loop) and on-demand NATS triggers (see
// internal/natssvc) alike — with on-demand triggers preferred whenever
// both are waiting for a slot.
//
// Concurrency between DIFFERENT tasks already happens without this: each
// task.Scheduled gets its own long-lived goroutine in main.go
// (go schedule.Loop(ctx, t, pool)), so several tasks due at the same
// moment already run in parallel for free. What this package adds is a
// CAP on how many of those parallel Runs are allowed to be doing real
// work at once — several backups, all hitting S3/wal-g/NATS
// simultaneously with no limit, can saturate shared bandwidth or CPU on
// a modest VM, especially once tasks can repeat every few hours (see
// schedule.EveryNHoursAt) and most of them are deliberately clustered
// around the same time of day. The rest simply wait their turn instead
// of running unbounded.
//
// Priority is why this isn't just a buffered channel used as a
// semaphore: a plain channel-based semaphore serves waiters in
// whatever order the Go runtime happens to wake them (no ordering
// guarantee at all, let alone priority). An operator running
// `osi4iot backup trigger nats` wants that request to jump ahead of
// whatever's next in the *scheduled* queue, not queue behind it — so
// Pool keeps two separate waiting lists and always drains the manual
// one first whenever a slot frees up.
package taskpool

import (
	"context"
	"fmt"
)

// Pool bounds concurrent task execution to Size slots, with two
// priority classes: manual (on-demand NATS triggers) and scheduled
// (periodic runs). Build one with New; nil-safe methods aren't needed
// since every caller in this service holds a real *Pool from main.go.
type Pool struct {
	size  int
	acts  chan action
	inUse int
	// manual/scheduled hold the waiting list for each priority class,
	// in arrival order within the class. Only ever touched inside run,
	// so no separate mutex is needed — see run's doc comment.
	manual    []chan struct{}
	scheduled []chan struct{}
}

// action is how every exported method talks to the single goroutine
// (run) that owns Pool's actual state — see run's doc comment for why.
type action func(p *Pool)

// New builds a Pool with room for size concurrent Runs. size <= 0 is
// treated as 1 (a pool with no capacity would deadlock every caller
// forever, which is never useful — the closest sane behavior is "run
// one at a time").
func New(size int) *Pool {
	if size <= 0 {
		size = 1
	}
	p := &Pool{size: size, acts: make(chan action)}
	go p.run()
	return p
}

// run is Pool's single owning goroutine: every field access above goes
// through it via acts, so Pool needs no mutex despite being called
// concurrently from every task's goroutine (each schedule.Loop, plus
// every natssvc request handler). This trades a small amount of
// channel-passing overhead for priority logic (grantNext) that's
// straightforward to read and impossible to get subtly wrong under a
// lock, which matters more here than raw throughput — task Runs
// themselves take seconds to hours; the pool's own bookkeeping is not
// where this service's time goes.
func (p *Pool) run() {
	for act := range p.acts {
		act(p)
	}
}

// do sends act to run and waits for it to finish, so callers observe
// Pool's state changes as if they'd taken a lock themselves.
func (p *Pool) do(act func(p *Pool)) {
	done := make(chan struct{})
	p.acts <- func(p *Pool) {
		act(p)
		close(done)
	}
	<-done
}

// AcquireManual blocks until a slot is free, preferring this caller
// over anything already waiting in the scheduled class, or until ctx is
// done. On success, the returned release func must be called exactly
// once, when the caller's task.Task.Run has returned.
func (p *Pool) AcquireManual(ctx context.Context) (release func(), err error) {
	return p.acquire(ctx, true)
}

// AcquireScheduled blocks until a slot is free — behind any waiting
// manual acquire, ahead of nothing — or until ctx is done. On success,
// the returned release func must be called exactly once, when the
// caller's task.Task.Run has returned.
func (p *Pool) AcquireScheduled(ctx context.Context) (release func(), err error) {
	return p.acquire(ctx, false)
}

func (p *Pool) acquire(ctx context.Context, manual bool) (func(), error) {
	granted := make(chan struct{})

	p.do(func(p *Pool) {
		if p.inUse < p.size {
			p.inUse++
			close(granted)
			return
		}
		if manual {
			p.manual = append(p.manual, granted)
		} else {
			p.scheduled = append(p.scheduled, granted)
		}
	})

	select {
	case <-granted:
		return p.releaseFunc(), nil
	case <-ctx.Done():
		// Whether granted was still waiting or had just been handed a
		// slot in the instant before this fired, abandon (below) does
		// the right thing either way — see its doc comment.
		p.abandon(granted, manual)
		return nil, fmt.Errorf("waiting for a task pool slot: %w", ctx.Err())
	}
}

// abandon removes granted from its waiting list if it's still there —
// the caller gave up before a slot reached it. If it's NOT there
// anymore, grantNext already handed it a slot in the narrow race
// between that and ctx.Done() firing (including the case where it was
// granted synchronously inside acquire's own p.do call, before select
// was even entered); since the caller is walking away regardless, that
// slot is given straight back to the next waiter instead of leaking
// forever.
func (p *Pool) abandon(granted chan struct{}, manual bool) {
	p.do(func(p *Pool) {
		list := &p.scheduled
		if manual {
			list = &p.manual
		}
		for i, w := range *list {
			if w == granted {
				*list = append((*list)[:i], (*list)[i+1:]...)
				return
			}
		}
		// Already granted: give the slot back.
		p.inUse--
		p.grantNext()
	})
}

func (p *Pool) releaseFunc() func() {
	return func() {
		p.do(func(p *Pool) {
			p.inUse--
			p.grantNext()
		})
	}
}

// grantNext hands freed capacity to waiters, manual class first, until
// either the pool is full again or both lists are empty. Only ever
// called from within run (via do), same as every other field access.
func (p *Pool) grantNext() {
	for p.inUse < p.size {
		var next chan struct{}
		switch {
		case len(p.manual) > 0:
			next, p.manual = p.manual[0], p.manual[1:]
		case len(p.scheduled) > 0:
			next, p.scheduled = p.scheduled[0], p.scheduled[1:]
		default:
			return
		}
		p.inUse++
		close(next)
	}
}
