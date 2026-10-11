// Package schedule provides the "next occurrence of a recurring
// hour-of-day schedule" helpers used by every periodic task in
// system_manager, plus the generic loop that drives any task.Scheduled
// on that timer until its context is cancelled, gated through a
// taskpool.Pool so a burst of simultaneously-due tasks doesn't run
// unbounded. It used to be backup- and cert-renewal-specific (two
// near-identical hand-rolled loops); now every task in the service,
// present or future, shares this one.
package schedule

import (
	"context"
	"log"
	"time"

	"system_manager/internal/task"
	"system_manager/internal/taskpool"
)

// DailyAt returns the next UTC occurrence of hour:00 at or after now —
// today's if it's still ahead, otherwise tomorrow's. It's the
// once-a-day special case of EveryNHoursAt (hour, 24) — kept as its own
// named function since "once a day at a fixed hour" reads more directly
// than "every 24 hours" at every call site that only ever means that.
func DailyAt(now time.Time, hour int) time.Time {
	return EveryNHoursAt(now, hour, 24)
}

// EveryNHoursAt returns the next UTC time at or after now on the
// startHour-anchored, everyHours-spaced schedule: startHour,
// startHour+everyHours, startHour+2*everyHours, ..., every day,
// indefinitely. DailyAt(now, hour) is this with everyHours == 24.
//
// If everyHours doesn't evenly divide 24 (5, 7, 9h, ...), the
// clock-time of the first run each day drifts by (24 mod everyHours)
// hours from the day before, since the anchor is recomputed from
// startHour fresh each day and the period doesn't line back up with it
// — e.g. everyHours=5 from startHour=0 gives 00:00, 05:00, 10:00,
// 15:00, 20:00, then 01:00 the NEXT day (not 00:00), 06:00, ... A
// divisor of 24 (1, 2, 3, 4, 6, 8, 12, 24) keeps the same clock times
// every day; a non-divisor still produces a valid, deterministic
// schedule, just not a calendar-stable one. everyHours <= 0 is treated
// as 24 (i.e. behaves like DailyAt) — a schedule that never repeats
// isn't a useful default for a caller that asked for a periodic one.
func EveryNHoursAt(now time.Time, startHour, everyHours int) time.Time {
	if everyHours <= 0 {
		everyHours = 24
	}
	now = now.UTC()
	period := time.Duration(everyHours) * time.Hour
	anchor := time.Date(now.Year(), now.Month(), now.Day(), startHour, 0, 0, 0, time.UTC)

	if anchor.After(now) {
		return anchor
	}
	// anchor is at or before now: advance it by whole periods until
	// it's strictly after now. Computed directly rather than looping —
	// works the same whether anchor is seconds or years behind now.
	// periods is an explicit int64 count (not a time.Duration): dividing
	// two Durations of the same unit gives a correct dimensionless
	// ratio, but its type stays "Duration" unless converted, which would
	// silently mean "1 nanosecond" for the "+ 1" below instead of "one
	// more period".
	elapsed := now.Sub(anchor)
	periods := int64(elapsed/period) + 1
	return anchor.Add(time.Duration(periods) * period)
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
// is cancelled. Each run first waits for a pool slot as a SCHEDULED
// (lower-priority) acquire — an on-demand NATS trigger for the same or
// a different task, arriving while this one is waiting its turn, is
// served first (see taskpool). Nothing here prevents an overlapping
// on-demand NATS trigger from running the same task at the same time;
// that's what task.Serialize/task.SerializeScheduled are for, and
// main.go wraps every task with one of them before it ever reaches Loop
// or natssvc.Run.
func Loop(ctx context.Context, t task.Scheduled, pool *taskpool.Pool) {
	for {
		wait := time.Until(t.NextRun(time.Now()))
		log.Printf("[%s] next run in %s", t.Subject(), wait.Round(time.Minute))
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
			run(ctx, t, pool)
		}
	}
}

func run(ctx context.Context, t task.Task, pool *taskpool.Pool) {
	release, err := pool.AcquireScheduled(ctx)
	if err != nil {
		log.Printf("[%s] SKIPPED: %v", t.Subject(), err)
		return
	}
	defer release()

	output, err := t.Run(ctx, nil)
	if err != nil {
		log.Printf("[%s] FAILED: %v\n%s", t.Subject(), err, output)
		return
	}
	log.Printf("[%s] OK\n%s", t.Subject(), output)
}
