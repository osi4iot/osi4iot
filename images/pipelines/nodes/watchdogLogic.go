package nodes

// Watchdog node logic (pure): says when a source stops sending messages and
// when it comes back.

import (
	"fmt"
	"time"
)

type watchdogConfig struct {
	KeyPath     string
	Timeout     time.Duration
	Repeat      time.Duration // 0: warn once per silence
	Expected    []joinSource  // sources watched even before their first message
	PassThrough bool
}

// watchdogState is the state of one source.
type watchdogState struct {
	LastSeen  int64 `json:"lastSeen"` // ms; for an expected source never seen, when watching began
	Seen      bool  `json:"seen"`     // it sent at least one message
	Lost      bool  `json:"lost"`
	LostAt    int64 `json:"lostAt,omitempty"`
	LastAlert int64 `json:"lastAlert,omitempty"`
}

func parseWatchdogConfig(settings map[string]any, resolve topicResolver) (*watchdogConfig, error) {
	cfg := &watchdogConfig{
		KeyPath:     settingString(settings, "keyPath", ""),
		Timeout:     time.Duration(settingNumber(settings, "timeoutSeconds", 0) * float64(time.Second)),
		Repeat:      time.Duration(settingNumber(settings, "repeatSeconds", 0) * float64(time.Second)),
		PassThrough: settingBool(settings, "passThrough", false),
	}
	if cfg.Timeout < time.Second {
		return nil, fmt.Errorf("the timeout must be at least 1 second")
	}
	if cfg.Repeat < 0 {
		return nil, fmt.Errorf("the repeat interval cannot be negative")
	}
	// the expected sources are given like the Join's
	join, err := parseJoinConfig(map[string]any{"keyPath": orTopic(cfg.KeyPath), "sources": settings["sources"]}, resolve)
	if err != nil {
		return nil, err
	}
	cfg.Expected = join.Sources
	if len(cfg.Expected) > 0 && cfg.KeyPath == "" {
		return nil, fmt.Errorf("the expected sources need a key (e.g. topic)")
	}
	return cfg, nil
}

func orTopic(path string) string {
	if path == "" {
		return "topic"
	}
	return path
}

// name is how a source is called in the events: its alias, or its key.
func (c *watchdogConfig) name(key string) string {
	for _, s := range c.Expected {
		if s.Key == key {
			return s.Alias
		}
	}
	if key == "" {
		return "the input"
	}
	return key
}

// seen records a message of a source. Returns the "restored" event if the
// source was lost.
func (c *watchdogConfig) seen(state *watchdogState, key string, now time.Time) (map[string]any, *watchdogState) {
	next := &watchdogState{LastSeen: now.UnixMilli(), Seen: true}
	if state == nil || !state.Lost {
		return nil, next
	}
	silence := now.Sub(time.UnixMilli(state.LastSeen))
	name := c.name(key)
	return map[string]any{
		"event":           "restored",
		"key":             key,
		"source":          name,
		"lastSeen":        isoTime(time.UnixMilli(state.LastSeen)),
		"lostAt":          isoTime(time.UnixMilli(state.LostAt)),
		"downtimeSeconds": roundTo(silence.Seconds(), 1),
		"message":         fmt.Sprintf("Data from %s again after %s without data", name, humanDuration(silence)),
	}, next
}

// check is the clock's look at a source: the "lost" event when its silence
// reaches the timeout (and again every Repeat). The silence counts from
// watchingSince at least, so that a node that was stopped does not report
// the time it was not watching.
func (c *watchdogConfig) check(state *watchdogState, key string, now, watchingSince time.Time) (map[string]any, *watchdogState) {
	if state == nil {
		return nil, nil
	}
	last := time.UnixMilli(state.LastSeen)
	from := last
	if watchingSince.After(from) {
		from = watchingSince
	}
	silence := now.Sub(last)
	next := *state
	name := c.name(key)
	event := func(repeat bool) map[string]any {
		text := fmt.Sprintf("No data from %s for %s", name, humanDuration(silence))
		if !state.Seen {
			text = fmt.Sprintf("No data from %s since watching began (%s)", name, humanDuration(silence))
		}
		e := map[string]any{
			"event":            "lost",
			"key":              key,
			"source":           name,
			"silentForSeconds": roundTo(silence.Seconds(), 1),
			"message":          text,
		}
		if state.Seen {
			e["lastSeen"] = isoTime(last)
		}
		if repeat {
			e["repeat"] = true
		}
		return e
	}
	switch {
	case !state.Lost && now.Sub(from) >= c.Timeout:
		next.Lost, next.LostAt, next.LastAlert = true, now.UnixMilli(), now.UnixMilli()
		return event(false), &next
	case state.Lost && c.Repeat > 0 && now.Sub(time.UnixMilli(state.LastAlert)) >= c.Repeat:
		next.LastAlert = now.UnixMilli()
		return event(true), &next
	}
	return nil, state
}

// humanDuration writes a duration as "45 s", "12 min", "3 h 5 min".
func humanDuration(d time.Duration) string {
	s := int(d.Round(time.Second).Seconds())
	switch {
	case s < 120:
		return fmt.Sprintf("%d s", s)
	case s < 3600:
		return fmt.Sprintf("%d min", s/60)
	case s < 48*3600:
		return fmt.Sprintf("%d h %d min", s/3600, (s%3600)/60)
	default:
		return fmt.Sprintf("%d d %d h", s/86400, (s%86400)/3600)
	}
}

func roundTo(v float64, decimals int) float64 {
	p := 1.0
	for i := 0; i < decimals; i++ {
		p *= 10
	}
	if v < 0 {
		return -float64(int64(-v*p+0.5)) / p
	}
	return float64(int64(v*p+0.5)) / p
}
