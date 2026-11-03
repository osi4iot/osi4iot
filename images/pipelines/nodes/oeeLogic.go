package nodes

// OEE node logic (pure): Overall Equipment Effectiveness per day or shift,
// OEE = Availability × Performance × Quality.
//
//   - The machine's state comes in messages with a state field, by default
//     the change events of a MachineState node (payload.state, at the time
//     in payload.since). Production states make run time; planned stop
//     states are left out of the planned production time; any other state
//     is downtime (Unknown too, unless it is set to be left out).
//   - The planned stops of the calendar (daily breaks, non-working weekdays,
//     holidays) are left out of the downtime too: if the machine is stopped
//     then, that time is not a loss. If it produces, it counts as run time.
//   - The pieces come in count fields (total, good and/or rejected), as
//     increments or as cumulative counters.
//
//	Availability = run / (run + downtime)
//	Performance  = ideal cycle time × total pieces / run
//	Quality      = good / total
//
// Times are accounted with the clock (the state lasts until it changes);
// the state changes and the pieces are placed by their time, never ahead
// of their arrival.

import (
	"fmt"
	"strings"
	"time"
)

const (
	oeeCountIncrement  = "increment"
	oeeCountCumulative = "cumulative"
)

type oeeBreak struct{ From, To int } // minutes after midnight

type oeeConfig struct {
	StateField        string
	StateTimePath     string
	ProductionStates  map[string]bool
	PlannedStopStates map[string]bool
	UnknownExcluded   bool
	TotalField        string
	GoodField         string
	RejectField       string
	CountMode         string
	IdealCycle        float64 // seconds per piece
	Breaks            []oeeBreak
	NonWorkingDays    map[time.Weekday]bool
	Holidays          map[string]bool // YYYY-MM-DD
	KeyPath           string
	TimePath          string
	SummaryEvery      time.Duration
	periods           *machineConfig // Location and Shifts: the periods
}

type oeeCounter struct {
	Has  bool    `json:"has,omitempty"`
	Last float64 `json:"last,omitempty"`
}

type oeeState struct {
	State        string                 `json:"state,omitempty"` // "" until the first state message
	StateSince   int64                  `json:"stateSince,omitempty"`
	Accounted    int64                  `json:"accounted"`
	Period       string                 `json:"period"`
	PeriodStart  int64                  `json:"periodStart"`
	Run          float64                `json:"run"`
	Downtime     float64                `json:"downtime"`
	PlannedStop  float64                `json:"plannedStop"`
	CalendarStop float64                `json:"calendarStop"`
	Excluded     float64                `json:"excluded"`
	DownByState  map[string]float64     `json:"downByState"`
	Total        float64                `json:"total"`
	Good         float64                `json:"good"`
	Reject       float64                `json:"reject"`
	Counters     map[string]*oeeCounter `json:"counters,omitempty"`
	LastSummary  int64                  `json:"lastSummary,omitempty"`
	Topic        string                 `json:"topic,omitempty"`
}

type oeeOutcome struct {
	Summaries []map[string]any
	Next      *oeeState
}

func parseOeeConfig(settings map[string]any, loc *time.Location) (*oeeConfig, error) {
	if loc == nil {
		loc = time.UTC
	}
	cfg := &oeeConfig{
		StateField:        settingString(settings, "stateField", "payload.state"),
		StateTimePath:     settingString(settings, "stateTimePath", "payload.since"),
		ProductionStates:  map[string]bool{},
		PlannedStopStates: map[string]bool{},
		UnknownExcluded:   settingBool(settings, "unknownExcluded", false),
		TotalField:        settingString(settings, "totalField", ""),
		GoodField:         settingString(settings, "goodField", ""),
		RejectField:       settingString(settings, "rejectField", ""),
		CountMode:         settingString(settings, "countMode", oeeCountIncrement),
		IdealCycle:        settingNumber(settings, "idealCycleSeconds", 0),
		NonWorkingDays:    map[time.Weekday]bool{},
		Holidays:          map[string]bool{},
		KeyPath:           settingString(settings, "keyPath", ""),
		TimePath:          timePathSetting(settings),
		SummaryEvery:      time.Duration(settingNumber(settings, "summaryEveryMinutes", 0) * float64(time.Minute)),
	}
	for _, s := range settingStrings(settings, "productionStates") {
		cfg.ProductionStates[s] = true
	}
	for _, s := range settingStrings(settings, "plannedStopStates") {
		if cfg.ProductionStates[s] {
			return nil, fmt.Errorf("state %q cannot be both a production state and a planned stop", s)
		}
		cfg.PlannedStopStates[s] = true
	}
	switch {
	case len(cfg.ProductionStates) == 0:
		return nil, fmt.Errorf("at least one production state is required")
	case cfg.IdealCycle <= 0:
		return nil, fmt.Errorf("the ideal cycle time must be greater than 0")
	case cfg.TotalField == "" && cfg.GoodField == "":
		return nil, fmt.Errorf("the field of the total pieces or of the good pieces is required")
	case cfg.TotalField == "" && cfg.RejectField == "" && cfg.GoodField != "":
		return nil, fmt.Errorf("with only good pieces, the total or the rejected pieces are needed too")
	case cfg.CountMode != oeeCountIncrement && cfg.CountMode != oeeCountCumulative:
		return nil, fmt.Errorf("count mode must be increment or cumulative")
	case cfg.SummaryEvery < 0:
		return nil, fmt.Errorf("the summary interval cannot be negative")
	}
	shifts, err := parseShifts(settings)
	if err != nil {
		return nil, err
	}
	cfg.periods = &machineConfig{Location: loc, Shifts: shifts}
	for _, text := range settingStrings(settings, "breaks") {
		from, to, ok := strings.Cut(text, "-")
		a, errA := parseClock(from)
		b, errB := parseClock(to)
		if !ok || errA != nil || errB != nil || b <= a {
			return nil, fmt.Errorf("break %q is not a range HH:MM-HH:MM within a day", text)
		}
		cfg.Breaks = append(cfg.Breaks, oeeBreak{From: a, To: b})
	}
	for _, raw := range settingList(settings, "nonWorkingDays") {
		day, ok := toNumber(raw)
		if !ok || day < 0 || day > 6 || day != float64(int(day)) {
			return nil, fmt.Errorf("non-working days are weekdays 0 (Sunday) to 6 (Saturday)")
		}
		cfg.NonWorkingDays[time.Weekday(int(day))] = true
	}
	for _, text := range settingStrings(settings, "holidays") {
		if _, err := time.ParseInLocation("2006-01-02", text, loc); err != nil {
			return nil, fmt.Errorf("holiday %q is not a date YYYY-MM-DD", text)
		}
		cfg.Holidays[text] = true
	}
	return cfg, nil
}

// settingList reads a JSON array setting (or comma separated text) as is.
func settingList(settings map[string]any, key string) []any {
	switch v := settings[key].(type) {
	case []any:
		return v
	case string:
		out := []any{}
		for _, s := range settingStrings(settings, key) {
			out = append(out, s)
		}
		return out
	}
	return nil
}

// calendarStop is the time of [a, b) in planned stops of the calendar.
func (c *oeeConfig) calendarStop(a, b time.Time) time.Duration {
	if !b.After(a) {
		return 0
	}
	loc := c.periods.Location
	overlap := func(from, to time.Time) time.Duration {
		if from.Before(a) {
			from = a
		}
		if to.After(b) {
			to = b
		}
		if to.After(from) {
			return to.Sub(from)
		}
		return 0
	}
	var total time.Duration
	la := a.In(loc)
	day := time.Date(la.Year(), la.Month(), la.Day(), 0, 0, 0, 0, loc)
	for day.Before(b) {
		next := day.AddDate(0, 0, 1)
		if c.Holidays[day.Format("2006-01-02")] || c.NonWorkingDays[day.Weekday()] {
			total += overlap(day, next)
		} else {
			for _, br := range c.Breaks {
				from := time.Date(day.Year(), day.Month(), day.Day(), br.From/60, br.From%60, 0, 0, loc)
				to := time.Date(day.Year(), day.Month(), day.Day(), br.To/60, br.To%60, 0, 0, loc)
				total += overlap(from, to)
			}
		}
		day = next
	}
	return total
}

func (c *oeeConfig) newState(topic string, now time.Time) *oeeState {
	name, start, _ := c.periods.period(now)
	return &oeeState{
		Accounted: now.UnixMilli(), Period: name, PeriodStart: start.UnixMilli(),
		DownByState: map[string]float64{}, Counters: map[string]*oeeCounter{}, Topic: topic,
	}
}

func cloneOeeState(s *oeeState) *oeeState {
	c := *s
	c.DownByState = make(map[string]float64, len(s.DownByState))
	for k, v := range s.DownByState {
		c.DownByState[k] = v
	}
	c.Counters = make(map[string]*oeeCounter, len(s.Counters))
	for k, v := range s.Counters {
		counter := *v
		c.Counters[k] = &counter
	}
	return &c
}

// spend puts [a, b) of the current state in its place.
func (c *oeeConfig) spend(s *oeeState, a, b time.Time) {
	seconds := b.Sub(a).Seconds()
	if seconds <= 0 || s.State == "" {
		return
	}
	switch {
	case c.ProductionStates[s.State]:
		s.Run += seconds
	case c.PlannedStopStates[s.State]:
		s.PlannedStop += seconds
	case s.State == machineUnknown && c.UnknownExcluded:
		s.Excluded += seconds
	default:
		calendar := c.calendarStop(a, b).Seconds()
		s.CalendarStop += calendar
		s.Downtime += seconds - calendar
		if s.DownByState == nil {
			s.DownByState = map[string]float64{}
		}
		s.DownByState[s.State] += seconds - calendar
	}
}

// account counts the time up to now, closing the periods it crosses.
func (c *oeeConfig) account(s *oeeState, key string, now time.Time, out *oeeOutcome) {
	for {
		_, _, end := c.periods.period(time.UnixMilli(s.PeriodStart))
		limit := now
		if !now.Before(end) {
			limit = end
		}
		if from := time.UnixMilli(s.Accounted); limit.After(from) {
			c.spend(s, from, limit)
			s.Accounted = limit.UnixMilli()
		}
		if now.Before(end) {
			return
		}
		out.Summaries = append(out.Summaries, c.summary(s, key, end, true))
		name, start, _ := c.periods.period(end)
		s.Period, s.PeriodStart, s.LastSummary = name, start.UnixMilli(), end.UnixMilli()
		s.Run, s.Downtime, s.PlannedStop, s.CalendarStop, s.Excluded = 0, 0, 0, 0, 0
		s.DownByState = map[string]float64{}
		s.Total, s.Good, s.Reject = 0, 0, 0
	}
}

// observe applies a message of time `now` that arrived at `arrival`.
func (c *oeeConfig) observe(state *oeeState, key, topic string, payload map[string]any, now, arrival time.Time) oeeOutcome {
	var out oeeOutcome
	var s *oeeState
	if state == nil {
		s = c.newState(topic, now)
	} else {
		s = cloneOeeState(state)
	}
	s.Topic = topic
	// a state change, at its own time (MachineState's "since")
	if raw, ok := lookupPath(topic, payload, c.StateField); ok {
		if text, isText := raw.(string); isText && strings.TrimSpace(text) != "" {
			at := eventTime(topic, payload, c.StateTimePath, now)
			if at.After(arrival) {
				at = arrival
			}
			c.account(s, key, maxTime(at, time.UnixMilli(s.Accounted)), &out)
			if text != s.State {
				s.State, s.StateSince = text, maxTime(at, time.UnixMilli(s.Accounted)).UnixMilli()
			}
		}
	}
	c.account(s, key, maxTime(now, time.UnixMilli(s.Accounted)), &out)
	// pieces: to the current period
	// each count field adds to its own sum: they may come in different messages
	if v, ok := c.count(s, "total", c.TotalField, topic, payload); ok {
		s.Total += v
	}
	if v, ok := c.count(s, "good", c.GoodField, topic, payload); ok {
		s.Good += v
	}
	if v, ok := c.count(s, "reject", c.RejectField, topic, payload); ok {
		s.Reject += v
	}
	out.Next = s
	return out
}

// count reads a count field: the increment it brings (cumulative counters:
// the increase since the last reading, a decrease is a restart from zero).
func (c *oeeConfig) count(s *oeeState, name, field, topic string, payload map[string]any) (float64, bool) {
	if field == "" {
		return 0, false
	}
	raw, ok := lookupPath(topic, payload, field)
	if !ok {
		return 0, false
	}
	value, ok := toNumber(raw)
	if !ok {
		return 0, false
	}
	if c.CountMode == oeeCountIncrement {
		return value, true
	}
	if s.Counters == nil {
		s.Counters = map[string]*oeeCounter{}
	}
	counter, ok := s.Counters[name]
	if !ok {
		counter = &oeeCounter{}
		s.Counters[name] = counter
	}
	if !counter.Has {
		counter.Has, counter.Last = true, value
		return 0, true
	}
	delta := value - counter.Last
	if delta < 0 {
		delta = value
	}
	counter.Last = value
	return delta, true
}

// tick is the clock: the time of the state up to now, the ends of the
// periods and the periodic summary.
func (c *oeeConfig) tick(state *oeeState, key string, now time.Time) oeeOutcome {
	var out oeeOutcome
	if state == nil {
		return out
	}
	s := cloneOeeState(state)
	c.account(s, key, maxTime(now, time.UnixMilli(s.Accounted)), &out)
	if c.SummaryEvery > 0 && now.Sub(time.UnixMilli(maxInt64(s.LastSummary, s.PeriodStart))) >= c.SummaryEvery {
		out.Summaries = append(out.Summaries, c.summary(s, key, now, false))
		s.LastSummary = now.UnixMilli()
	}
	out.Next = s
	return out
}

// pieces of the period from the fields there are: the total (or good plus
// rejected), the good ones (or total minus rejected, or all of them when
// there is no quality data) and the rejected ones.
func (c *oeeConfig) pieces(s *oeeState) (total, good, reject float64) {
	total = s.Total
	if c.TotalField == "" {
		total = s.Good + s.Reject
	}
	switch {
	case c.GoodField != "":
		good = s.Good
	case c.RejectField != "":
		good = total - s.Reject
	default:
		good = total
	}
	if good < 0 {
		good = 0
	}
	if good > total {
		good = total
	}
	return total, good, total - good
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

// summary of the period up to `until` (final: the period ended). The
// ratios are percentages; a ratio without data (e.g. no run time) is left
// out, and then so is the OEE.
func (c *oeeConfig) summary(s *oeeState, key string, until time.Time, final bool) map[string]any {
	planned := s.Run + s.Downtime
	total, good, reject := c.pieces(s)
	e := map[string]any{
		"event":        "summary",
		"period":       s.Period,
		"periodStart":  isoTime(time.UnixMilli(s.PeriodStart)),
		"until":        isoTime(until),
		"final":        final,
		"currentState": s.State,
		"times": map[string]any{
			"run":                   roundTo(s.Run, 1),
			"downtime":              roundTo(s.Downtime, 1),
			"plannedStop":           roundTo(s.PlannedStop, 1),
			"calendarStop":          roundTo(s.CalendarStop, 1),
			"excluded":              roundTo(s.Excluded, 1),
			"plannedProductionTime": roundTo(planned, 1),
		},
		"counts": map[string]any{"total": total, "good": good, "reject": reject},
	}
	downByState := map[string]any{}
	for state, seconds := range s.DownByState {
		if seconds > 0 {
			downByState[state] = roundTo(seconds, 1)
		}
	}
	e["downtimeByState"] = downByState
	ideal := c.IdealCycle * total
	e["losses"] = map[string]any{
		"availabilitySeconds": roundTo(s.Downtime, 1),
		"performanceSeconds":  roundTo(s.Run-ideal, 1), // negative: faster than the ideal cycle
		"qualityPieces":       reject,
	}
	var a, p, q float64
	hasA, hasP, hasQ := planned > 0, s.Run > 0, total > 0
	if hasA {
		a = s.Run / planned
		e["availability"] = roundTo(100*a, 2)
	}
	if hasP {
		p = ideal / s.Run
		e["performance"] = roundTo(100*p, 2)
	}
	if hasQ {
		q = good / total
		e["quality"] = roundTo(100*q, 2)
	}
	if hasA && hasP && hasQ {
		e["oee"] = roundTo(100*a*p*q, 2)
	}
	if key != "" {
		e["key"] = key
	}
	return e
}
