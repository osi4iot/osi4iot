package llmagent

import (
	"context"
	"fmt"
	"strings"
	"time"
	_ "time/tzdata" // the users' time zones, whatever the container has
)

// The user's time zone. Data are stored and computed in UTC, but the user
// reads the times in their own zone: the chat sends it with each question
// (the browser knows it), and when a question comes without it (Telegram,
// a voice note) the node gives the group's, else UTC. The agent gets the
// zone and the local time with the question, and the tools that take a
// "timezone" argument get it by default (sensor_history, asset_state,
// current_date), so that their times are the user's even when the model
// does not pass it.

// ResolveTimeZone returns the first valid IANA name of the candidates,
// "UTC" when none is.
func ResolveTimeZone(candidates ...string) string {
	for _, c := range candidates {
		c = strings.TrimSpace(c)
		if c == "" || len(c) > 64 {
			continue
		}
		if loc, err := time.LoadLocation(c); err == nil {
			return loc.String()
		}
	}
	return "UTC"
}

// timeContext is what the agent is told with each question.
func timeContext(zone string, now time.Time) string {
	loc, err := time.LoadLocation(zone)
	if err != nil {
		loc, zone = time.UTC, "UTC"
	}
	local := now.In(loc)
	return fmt.Sprintf("[Context: the user's time zone is %s; their local time is %s (%s). "+
		"Write every time in this zone; the data tools already return their times in it.]\n\n",
		zone, local.Format("Monday 2006-01-02 15:04"), local.Format("UTC-07:00"))
}

type timezoneKey struct{}

func withTimezone(ctx context.Context, zone string) context.Context {
	return context.WithValue(ctx, timezoneKey{}, zone)
}

func timezoneFrom(ctx context.Context) string {
	z, _ := ctx.Value(timezoneKey{}).(string)
	return z
}
