// Package task defines the common contract every system_manager job
// implements — backups, certificate renewal, and any future maintenance
// job — so both the periodic scheduler (internal/schedule) and the NATS
// request-reply layer (internal/natssvc) can drive them uniformly,
// instead of each subsystem wiring up its own ad-hoc trigger path (which
// is how only backups ended up reachable over NATS in the first place).
package task

import (
	"context"
	"fmt"
	"log"
	"runtime/debug"
	"sync"
	"time"
)

// Task is a maintenance job system_manager can run, either on its own
// periodic schedule, on demand via a NATS request, or both.
type Task interface {
	// Subject identifies the task for NATS routing and logging, as
	// dot-separated segments relative to the "system_manager" root —
	// e.g. "patroni.trigger_backup.admin" or "certs.renew". natssvc
	// turns this into the NATS subject
	// "system_manager.patroni.trigger_backup.admin" by
	// nesting one micro.Group per segment (see natssvc.registerTask).
	Subject() string

	// Run executes the task once. params is the request body a NATS
	// caller sent, JSON-decoded into a plain map — nil when triggered
	// by this task's own schedule (schedule.Loop never has a natural
	// source for one), and also nil for an on-demand NATS request that
	// carried no body at all (a payload is always optional; sending
	// none is not an error — see natssvc.registerTask). Most tasks
	// ignore it today; it exists so a task that DOES want structured
	// input (e.g. a future "restore this specific run" variant) doesn't
	// need a second, parallel dispatch path to get it — every task
	// already flows through the exact same Run call, on either trigger
	// path.
	//
	// The returned string is relayed as-is to NATS callers and to the
	// log; a non-nil error marks the run as failed (the output, if any,
	// is still relayed/logged alongside it — mirroring how
	// patroni_sidecar's raw output is preserved even on a failed
	// backup).
	Run(ctx context.Context, params map[string]any) (string, error)
}

// Scheduled is implemented by tasks that also run automatically on their
// own timer, in addition to being triggerable on demand over NATS. A
// task that should only ever be triggered manually (a one-off admin
// action, say) simply doesn't implement it, and is left out of the
// slice passed to schedule.Loop.
type Scheduled interface {
	Task
	// NextRun returns this task's next scheduled run time, computed
	// from now.
	NextRun(now time.Time) time.Time
}

// Serialize wraps t so concurrent calls to Run block on each other, AND
// so a panic inside t.Run can't escape and take down the whole process.
// Every task in this service is reachable two ways — its own periodic
// schedule and an on-demand NATS request — and without the mutex, a
// manual trigger arriving mid-run (or two manual triggers racing) would
// run the same job twice in parallel. main.go wraps every task with
// this exactly once, before handing it to both schedule.Loop and
// natssvc.Run, so those two packages never need to coordinate directly
// — including never each needing their own recover().
//
// The recover matters specifically because of params (see Task.Run's
// doc comment): it's external input — a NATS request body today, on the
// scheduled path always nil — and a future task that reads it with an
// unchecked type assertion (params["foo"].(string), no comma-ok) will
// panic on a wrong type or a missing key. In Go, a panic that's never
// recovered anywhere up its own goroutine's call stack kills the ENTIRE
// PROCESS, not just that goroutine — so one malformed request or one
// unlucky nil-params scheduled run, in a service that's normally
// running several other tasks' goroutines at any given moment, would
// take all of them down with it. Recovering here, at the one point
// every task's Run already flows through, converts that into an
// ordinary failed run instead: logged, and (for a NATS-triggered run)
// reported back as a 500, exactly like any other error from t.Run.
func Serialize(t Task) Task {
	return &serialized{t: t}
}

type serialized struct {
	t  Task
	mu sync.Mutex
}

func (s *serialized) Subject() string { return s.t.Subject() }

func (s *serialized) Run(ctx context.Context, params map[string]any) (output string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[%s] PANIC (recovered): %v\n%s", s.t.Subject(), r, debug.Stack())
			err = fmt.Errorf("panic: %v", r)
		}
	}()
	return s.t.Run(ctx, params)
}

// SerializeScheduled is Serialize for tasks that are also Scheduled,
// preserving NextRun (which Serialize, returning a plain Task, would
// otherwise drop).
func SerializeScheduled(t Scheduled) Scheduled {
	return &serializedScheduled{serialized: serialized{t: t}, t: t}
}

type serializedScheduled struct {
	serialized
	t Scheduled
}

func (s *serializedScheduled) NextRun(now time.Time) time.Time { return s.t.NextRun(now) }
