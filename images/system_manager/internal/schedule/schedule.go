// Package schedule provides the "next occurrence of HH:00 UTC" helper
// used by every daily task in system_manager, plus the generic loop that
// drives any task.Scheduled on that timer until its context is
// cancelled. It used to be backup- and cert-renewal-specific (two
// near-identical hand-rolled loops); now every task in the service,
// present or future, shares this one.
package schedule

import (
	"context"
	"log"
	"time"

	"system_manager/internal/task"
)

// DailyAt returns the next UTC occurrence of hour:00 at or after now —
// today's if it's still ahead, otherwise tomorrow's. It's the building
// block every task.Scheduled.NextRun implementation in this service uses
// for its own "once a day, at hour:00 UTC" cadence.
func DailyAt(now time.Time, hour int) time.Time {
	now = now.UTC()
	next := time.Date(now.Year(), now.Month(), now.Day(), hour, 0, 0, 0, time.UTC)
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next
}

// WeeklyAt returns the next UTC occurrence of weekday at hour:00, at or
// after now — this week's if it hasn't passed yet, otherwise next
// week's. Used by tasks (like prune) that shouldn't run as often as
// once a day.
func WeeklyAt(now time.Time, weekday time.Weekday, hour int) time.Time {
	now = now.UTC()
	next := time.Date(now.Year(), now.Month(), now.Day(), hour, 0, 0, 0, time.UTC)
	daysUntil := (int(weekday) - int(next.Weekday()) + 7) % 7
	next = next.AddDate(0, 0, daysUntil)
	if !next.After(now) {
		next = next.AddDate(0, 0, 7)
	}
	return next
}

// Loop runs t once per t.NextRun cycle, logging the outcome, until ctx
// is cancelled. It's a plain periodic driver — nothing here prevents an
// overlapping on-demand NATS trigger from running the same task at the
// same time; that's what task.Serialize/task.SerializeScheduled are for,
// and main.go wraps every task with one of them before it ever reaches
// Loop or natssvc.Run.
func Loop(ctx context.Context, t task.Scheduled) {
	for {
		wait := time.Until(t.NextRun(time.Now()))
		log.Printf("[%s] next run in %s", t.Subject(), wait.Round(time.Minute))
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
			run(ctx, t)
		}
	}
}

func run(ctx context.Context, t task.Task) {
	output, err := t.Run(ctx)
	if err != nil {
		log.Printf("[%s] FAILED: %v\n%s", t.Subject(), err, output)
		return
	}
	log.Printf("[%s] OK\n%s", t.Subject(), output)
}
