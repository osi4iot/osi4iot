// Package task defines the common contract every system_manager job
// implements — backups, certificate renewal, and any future maintenance
// job — so both the periodic scheduler (internal/schedule) and the NATS
// request-reply layer (internal/natssvc) can drive them uniformly,
// instead of each subsystem wiring up its own ad-hoc trigger path (which
// is how only backups ended up reachable over NATS in the first place).
package task

import (
	"context"
	"sync"
	"time"
)

// Task is a maintenance job system_manager can run, either on its own
// periodic schedule, on demand via a NATS request, or both.
type Task interface {
	// Subject identifies the task for NATS routing and logging, as
	// dot-separated segments relative to the "system_manager" root —
	// e.g. "backup.patroni.admin" or "certs.renew". natssvc turns this
	// into the NATS subject "system_manager.backup.patroni.admin" by
	// nesting one micro.Group per segment (see natssvc.registerTask).
	Subject() string

	// Run executes the task once. The returned string is relayed
	// as-is to NATS callers and to the log; a non-nil error marks the
	// run as failed (the output, if any, is still relayed/logged
	// alongside it — mirroring how backup_trigger's raw output is
	// preserved even on a failed backup).
	Run(ctx context.Context) (string, error)
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

// Serialize wraps t so concurrent calls to Run block on each other.
// Every task in this service is reachable two ways — its own periodic
// schedule and an on-demand NATS request — and without this, a manual
// trigger arriving mid-run (or two manual triggers racing) would run the
// same job twice in parallel. main.go wraps every task with this exactly
// once, before handing it to both schedule.Loop and natssvc.Run, so
// those two packages never need to coordinate directly.
func Serialize(t Task) Task {
	return &serialized{t: t}
}

type serialized struct {
	t  Task
	mu sync.Mutex
}

func (s *serialized) Subject() string { return s.t.Subject() }

func (s *serialized) Run(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.t.Run(ctx)
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
