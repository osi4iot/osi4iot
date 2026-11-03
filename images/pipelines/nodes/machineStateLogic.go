package nodes

// Machine state node logic (pure): the operating state of a machine from its
// signals (ordered rules, the first that holds wins), how long it spends in
// each state and how many times it changes, per day or per shift.

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

const machineUnknown = "Unknown"

type machineRule struct {
	State    string
	Property string
	Rule     switchRule
}

type machineConfig struct {
	Rules        []machineRule
	DefaultState string
	MinDuration  time.Duration
	UnknownAfter time.Duration // 0: never
	KeyPath      string
	Location     *time.Location
	Shifts       []int // minutes after midnight, sorted; empty: the calendar day
	SummaryEvery time.Duration
}

// machineState is the state of one machine (partition key).
type machineState struct {
	State          string             `json:"state"`
	Since          int64              `json:"since"`
	Candidate      string             `json:"candidate,omitempty"`
	CandidateSince int64              `json:"candidateSince,omitempty"`
	Period         string             `json:"period"`
	PeriodStart    int64              `json:"periodStart"`
	Durations      map[string]float64 `json:"durations"` // seconds in the current period
	Transitions    int                `json:"transitions"`
	Accounted      int64              `json:"accounted"` // ms; durations are counted up to here
	LastSeen       int64              `json:"lastSeen"`
	LastSummary    int64              `json:"lastSummary,omitempty"`
	Topic          string             `json:"topic,omitempty"`
}

func parseMachineConfig(settings map[string]any, loc *time.Location) (*machineConfig, error) {
	cfg := &machineConfig{
		DefaultState: settingString(settings, "defaultState", "Stopped"),
		MinDuration:  time.Duration(settingNumber(settings, "minDurationSeconds", 0) * float64(time.Second)),
		UnknownAfter: time.Duration(settingNumber(settings, "unknownAfterSeconds", 0) * float64(time.Second)),
		KeyPath:      settingString(settings, "keyPath", ""),
		SummaryEvery: time.Duration(settingNumber(settings, "summaryEveryMinutes", 0) * float64(time.Minute)),
		Location:     loc,
	}
	if cfg.Location == nil {
		cfg.Location = time.UTC
	}
	if cfg.MinDuration < 0 || cfg.UnknownAfter < 0 || cfg.SummaryEvery < 0 {
		return nil, fmt.Errorf("times cannot be negative")
	}
	for i, raw := range settingMaps(settings, "rules") {
		state := settingString(raw, "state", "")
		if state == "" {
			return nil, fmt.Errorf("rule %d: the state name is required", i+1)
		}
		sw, err := parseSwitchConfig(map[string]any{"rules": []any{raw}})
		if err != nil {
			return nil, fmt.Errorf("rule %d: %v", i+1, strings.TrimPrefix(err.Error(), "rule 1: "))
		}
		cfg.Rules = append(cfg.Rules, machineRule{
			State:    state,
			Property: settingString(raw, "property", "payload.value"),
			Rule:     sw.Rules[0],
		})
	}
	if len(cfg.Rules) == 0 {
		return nil, fmt.Errorf("at least one rule is required")
	}
	shifts, err := parseShifts(settings)
	if err != nil {
		return nil, err
	}
	cfg.Shifts = shifts
	return cfg, nil
}

// parseShifts reads the "shifts" setting (starts HH:MM) as minutes after
// midnight, sorted.
func parseShifts(settings map[string]any) ([]int, error) {
	shifts := []int{}
	for _, text := range settingStrings(settings, "shifts") {
		minutes, err := parseClock(text)
		if err != nil || minutes >= 24*60 {
			return nil, fmt.Errorf("shift start %q is not a time HH:MM", text)
		}
		shifts = append(shifts, minutes)
	}
	sort.Ints(shifts)
	for i := 1; i < len(shifts); i++ {
		if shifts[i] == shifts[i-1] {
			return nil, fmt.Errorf("shift starts are repeated")
		}
	}
	return shifts, nil
}

// parseClock reads a time of day HH:MM as minutes after midnight (24:00 is
// accepted, as the end of the day).
func parseClock(text string) (int, error) {
	var h, m int
	if _, err := fmt.Sscanf(strings.TrimSpace(text), "%d:%d", &h, &m); err != nil || h < 0 || h > 24 || m < 0 || m > 59 || (h == 24 && m != 0) {
		return 0, fmt.Errorf("%q is not a time HH:MM", text)
	}
	return h*60 + m, nil
}

// classify is the state the message asks for: the first rule that holds,
// or the default state.
func (c *machineConfig) classify(topic string, payload map[string]any) string {
	for _, r := range c.Rules {
		value, exists := lookupPath(topic, payload, r.Property)
		if r.Rule.matches(value, exists) {
			return r.State
		}
	}
	return c.DefaultState
}

// period is the period (day or shift) that contains t: its name, start and end.
func (c *machineConfig) period(t time.Time) (string, time.Time, time.Time) {
	local := t.In(c.Location)
	midnight := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, c.Location)
	if len(c.Shifts) == 0 {
		return midnight.Format("2006-01-02"), midnight, midnight.AddDate(0, 0, 1)
	}
	at := func(day time.Time, minutes int) time.Time {
		return time.Date(day.Year(), day.Month(), day.Day(), minutes/60, minutes%60, 0, 0, c.Location)
	}
	// the last shift start at or before t (maybe yesterday's last one)
	start := at(midnight.AddDate(0, 0, -1), c.Shifts[len(c.Shifts)-1])
	for _, m := range c.Shifts {
		if s := at(midnight, m); !s.After(local) {
			start = s
		}
	}
	end := at(midnight.AddDate(0, 0, 1), c.Shifts[0])
	for _, m := range c.Shifts {
		if s := at(midnight, m); s.After(local) {
			end = s
			break
		}
	}
	if !end.After(start) {
		end = at(start.AddDate(0, 0, 1), c.Shifts[0])
	}
	return start.Format("2006-01-02 15:04"), start, end
}

// machineOutcome is what a message or the clock did to a machine.
type machineOutcome struct {
	Changes   []map[string]any
	Summaries []map[string]any
	Next      *machineState
}

// account counts the time of the current state up to now, closing the
// periods it crosses (their summaries are returned).
func (c *machineConfig) account(s *machineState, key string, now time.Time, out *machineOutcome) {
	for {
		_, _, end := c.period(time.UnixMilli(s.PeriodStart))
		limit := now
		if !now.Before(end) {
			limit = end
		}
		if from := time.UnixMilli(s.Accounted); limit.After(from) {
			s.Durations[s.State] += limit.Sub(from).Seconds()
			s.Accounted = limit.UnixMilli()
		}
		if now.Before(end) {
			return
		}
		out.Summaries = append(out.Summaries, c.summary(s, key, end, true))
		name, start, _ := c.period(end)
		s.Period, s.PeriodStart = name, start.UnixMilli()
		s.Durations, s.Transitions = map[string]float64{}, 0
		s.LastSummary = end.UnixMilli()
	}
}

func (c *machineConfig) newState(state, topic string, now time.Time) *machineState {
	name, start, _ := c.period(now)
	t := now.UnixMilli()
	return &machineState{
		State: state, Since: t, Period: name, PeriodStart: start.UnixMilli(),
		Durations: map[string]float64{}, Accounted: t, LastSeen: t, Topic: topic,
	}
}

func cloneMachineState(s *machineState) *machineState {
	c := *s
	c.Durations = make(map[string]float64, len(s.Durations))
	for k, v := range s.Durations {
		c.Durations[k] = v
	}
	return &c
}

// observe applies a message.
func (c *machineConfig) observe(state *machineState, key, topic string, payload map[string]any, now time.Time) machineOutcome {
	wanted := c.classify(topic, payload)
	var out machineOutcome
	if state == nil {
		out.Next = c.newState(wanted, topic, now)
		out.Changes = append(out.Changes, c.change(out.Next, key, "", 0, now))
		return out
	}
	s := cloneMachineState(state)
	s.LastSeen, s.Topic = now.UnixMilli(), topic
	c.account(s, key, now, &out)
	c.moveTo(s, key, wanted, now, &out)
	out.Next = s
	return out
}

// moveTo changes the state once the wanted one has held for the minimum
// duration (counted from when it was first seen, and its time is moved to
// it).
func (c *machineConfig) moveTo(s *machineState, key, wanted string, now time.Time, out *machineOutcome) {
	if wanted == s.State {
		s.Candidate, s.CandidateSince = "", 0
		return
	}
	if wanted != s.Candidate {
		s.Candidate, s.CandidateSince = wanted, now.UnixMilli()
	}
	since := time.UnixMilli(s.CandidateSince)
	if now.Sub(since) < c.MinDuration {
		return
	}
	// the new state began when it was first seen: that time is moved to it
	if !since.Before(time.UnixMilli(s.PeriodStart)) && since.Before(now) {
		moved := now.Sub(since).Seconds()
		s.Durations[s.State] -= moved
		if s.Durations[s.State] < 0 {
			s.Durations[s.State] = 0
		}
		s.Durations[wanted] += moved
	} else {
		since = now
	}
	previous := s.State
	previousDuration := since.Sub(time.UnixMilli(s.Since))
	s.State, s.Since = wanted, since.UnixMilli()
	s.Candidate, s.CandidateSince = "", 0
	s.Transitions++
	out.Changes = append(out.Changes, c.change(s, key, previous, previousDuration, now))
}

// tick is the clock: periods that end, the periodic summary, and Unknown
// when the machine stops sending.
func (c *machineConfig) tick(state *machineState, key string, now time.Time) machineOutcome {
	var out machineOutcome
	if state == nil {
		return out
	}
	s := cloneMachineState(state)
	// Unknown begins UnknownAfter after the last message: what came before
	// is counted (closing the periods it crosses), then the rest as Unknown.
	if c.UnknownAfter > 0 && s.State != machineUnknown && now.Sub(time.UnixMilli(s.LastSeen)) >= c.UnknownAfter {
		previous := s.State
		at := time.UnixMilli(s.LastSeen).Add(c.UnknownAfter)
		if !at.Before(time.UnixMilli(s.Accounted)) {
			c.account(s, key, at, &out)
		} else {
			// already counted past it: that time is moved to Unknown
			from := at
			if from.Before(time.UnixMilli(s.PeriodStart)) {
				from = time.UnixMilli(s.PeriodStart)
			}
			moved := time.UnixMilli(s.Accounted).Sub(from).Seconds()
			s.Durations[previous] = maxFloat(0, s.Durations[previous]-moved)
			s.Durations[machineUnknown] += moved
		}
		previousDuration := at.Sub(time.UnixMilli(s.Since))
		s.State, s.Since, s.Candidate, s.CandidateSince = machineUnknown, at.UnixMilli(), "", 0
		s.Transitions++
		out.Changes = append(out.Changes, c.change(s, key, previous, previousDuration, now))
	}
	c.account(s, key, now, &out)
	if c.SummaryEvery > 0 && now.Sub(time.UnixMilli(maxInt64(s.LastSummary, s.PeriodStart))) >= c.SummaryEvery {
		out.Summaries = append(out.Summaries, c.summary(s, key, now, false))
		s.LastSummary = now.UnixMilli()
	}
	out.Next = s
	return out
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func (c *machineConfig) change(s *machineState, key, previous string, previousDuration time.Duration, now time.Time) map[string]any {
	e := map[string]any{
		"event": "change",
		"state": s.State,
		"since": isoTime(time.UnixMilli(s.Since)),
		"at":    isoTime(now),
	}
	if key != "" {
		e["key"] = key
	}
	if previous != "" {
		e["previousState"] = previous
		e["previousDurationSeconds"] = roundTo(previousDuration.Seconds(), 1)
		e["message"] = fmt.Sprintf("%s → %s (after %s)", previous, s.State, humanDuration(previousDuration))
	} else {
		e["message"] = "State: " + s.State
	}
	return e
}

// summary of the current period up to `until` (final: the period ended).
func (c *machineConfig) summary(s *machineState, key string, until time.Time, final bool) map[string]any {
	durations := map[string]any{}
	percent := map[string]any{}
	total := until.Sub(time.UnixMilli(s.PeriodStart)).Seconds()
	for state, seconds := range s.Durations {
		if seconds <= 0 {
			continue
		}
		durations[state] = roundTo(seconds, 1)
		if total > 0 {
			percent[state] = roundTo(100*seconds/total, 2)
		}
	}
	e := map[string]any{
		"event":        "summary",
		"period":       s.Period,
		"periodStart":  isoTime(time.UnixMilli(s.PeriodStart)),
		"until":        isoTime(until),
		"final":        final,
		"durations":    durations,
		"percent":      percent,
		"transitions":  s.Transitions,
		"currentState": s.State,
	}
	if key != "" {
		e["key"] = key
	}
	return e
}
