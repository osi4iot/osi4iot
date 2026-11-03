package nodes

// Totalizer node logic (pure): turns signals into amounts per day and
// totals since the start. Each item reads one field in one of three modes:
//
//   - counter: a cumulative reading (energy meter, piece counter of a PLC,
//     hour meter). The amount is the increase between readings; a decrease
//     is a rollover (when rolloverAt is set) or a counter that restarted from
//     zero; an increase larger than maxStep is a meter change or a spike, and
//     is not counted (the reading becomes the new reference).
//   - rate: a rate (power in kW, flow in m³/h, speed...) integrated over time
//     with the trapezoidal rule, in rateTimeUnit (h: kW → kWh). Gaps longer
//     than maxGapSeconds are not integrated: no amount is made up.
//   - events: each message adds the field's number, or 1 when the field is
//     empty or not a number (pieces, starts, cycles...).
//
// The amounts are multiplied by the item's factor. Messages are placed in
// time by their timestamp (timePath, payload.timestamp by default), as in
// the Rainflow node; the clock closes a day only after idleClose without
// messages. A segment of a rate, or an increase of a counter, goes to the
// day of the message that closes it.

import (
	"fmt"
	"math"
	"time"
)

const (
	totalizerCounter = "counter"
	totalizerRate    = "rate"
	totalizerEvents  = "events"
)

type totalizerItem struct {
	Name       string
	Field      string
	Mode       string
	Unit       string
	Factor     float64
	RolloverAt float64       // counter: the value after which it starts again from 0; 0: none
	MaxStep    float64       // counter: largest valid increase; 0: no limit
	TimeUnit   time.Duration // rate: the time unit of the rate
	MaxGap     time.Duration // rate: longest segment integrated; 0: no limit
}

type totalizerConfig struct {
	Items        []totalizerItem
	KeyPath      string
	TimePath     string
	Location     *time.Location
	SummaryEvery time.Duration
}

// totalizerItemState is the state of one item of one partition key.
type totalizerItemState struct {
	HasLast   bool    `json:"hasLast,omitempty"`
	Last      float64 `json:"last,omitempty"`     // counter: last reading; rate: last rate
	LastTime  int64   `json:"lastTime,omitempty"` // ms
	Amount    float64 `json:"amount"`             // current period
	Total     float64 `json:"total"`
	RateMax   float64 `json:"rateMax,omitempty"`  // rate: in the period
	RateTime  float64 `json:"rateTime,omitempty"` // rate: seconds integrated in the period
	Gaps      int     `json:"gaps,omitempty"`     // rate: segments not integrated in the period
	Resets    int     `json:"resets,omitempty"`   // counter: restarts and rollovers in the period
	Rejected  int     `json:"rejected,omitempty"` // counter: increases above maxStep in the period
	Readings  int     `json:"readings,omitempty"` // messages with the field in the period
	HasRateMx bool    `json:"hasRateMx,omitempty"`
}

type totalizerState struct {
	Items       map[string]*totalizerItemState `json:"items"`
	Since       int64                          `json:"since"`
	Period      string                         `json:"period"`
	PeriodStart int64                          `json:"periodStart"`
	LastSummary int64                          `json:"lastSummary,omitempty"`
	LastTime    int64                          `json:"lastTime,omitempty"`
	LastArrival int64                          `json:"lastArrival,omitempty"`
	Topic       string                         `json:"topic,omitempty"`
}

type totalizerOutcome struct {
	Summaries []map[string]any
	Next      *totalizerState
}

var timeUnits = map[string]time.Duration{"s": time.Second, "min": time.Minute, "h": time.Hour, "d": 24 * time.Hour}

func parseTotalizerConfig(settings map[string]any, loc *time.Location) (*totalizerConfig, error) {
	cfg := &totalizerConfig{
		KeyPath:      settingString(settings, "keyPath", ""),
		TimePath:     timePathSetting(settings),
		Location:     loc,
		SummaryEvery: time.Duration(settingNumber(settings, "summaryEveryMinutes", 0) * float64(time.Minute)),
	}
	if cfg.Location == nil {
		cfg.Location = time.UTC
	}
	if cfg.SummaryEvery < 0 {
		return nil, fmt.Errorf("the summary interval cannot be negative")
	}
	names := map[string]bool{}
	for i, raw := range settingMaps(settings, "items") {
		item := totalizerItem{
			Name:       settingString(raw, "name", ""),
			Field:      settingString(raw, "field", ""),
			Mode:       settingString(raw, "mode", totalizerCounter),
			Unit:       settingString(raw, "unit", ""),
			Factor:     settingNumber(raw, "factor", 1),
			RolloverAt: settingNumber(raw, "rolloverAt", 0),
			MaxStep:    settingNumber(raw, "maxStep", 0),
			MaxGap:     time.Duration(settingNumber(raw, "maxGapSeconds", 0) * float64(time.Second)),
		}
		unit := settingString(raw, "rateTimeUnit", "h")
		item.TimeUnit = timeUnits[unit]
		where := fmt.Sprintf("item %d", i+1)
		if item.Name != "" {
			where = fmt.Sprintf("item %q", item.Name)
		}
		switch {
		case item.Name == "":
			return nil, fmt.Errorf("item %d: the name is required", i+1)
		case names[item.Name]:
			return nil, fmt.Errorf("%s: the name is repeated", where)
		case item.Mode != totalizerCounter && item.Mode != totalizerRate && item.Mode != totalizerEvents:
			return nil, fmt.Errorf("%s: mode must be counter, rate or events", where)
		case item.Field == "" && item.Mode != totalizerEvents:
			return nil, fmt.Errorf("%s: the field is required", where)
		case item.Factor == 0:
			return nil, fmt.Errorf("%s: the factor cannot be 0", where)
		case item.RolloverAt < 0 || item.MaxStep < 0 || item.MaxGap < 0:
			return nil, fmt.Errorf("%s: rollover, maximum step and maximum gap cannot be negative", where)
		case item.Mode == totalizerRate && item.TimeUnit == 0:
			return nil, fmt.Errorf("%s: the rate time unit must be s, min, h or d", where)
		}
		names[item.Name] = true
		cfg.Items = append(cfg.Items, item)
	}
	if len(cfg.Items) == 0 {
		return nil, fmt.Errorf("at least one item is required")
	}
	return cfg, nil
}

func (c *totalizerConfig) newState(topic string, now time.Time) *totalizerState {
	name, start, _ := dayPeriod(c.Location, now)
	s := &totalizerState{
		Items: map[string]*totalizerItemState{}, Since: now.UnixMilli(),
		Period: name, PeriodStart: start.UnixMilli(), Topic: topic,
	}
	for _, item := range c.Items {
		s.Items[item.Name] = &totalizerItemState{}
	}
	return s
}

func cloneTotalizerState(s *totalizerState) *totalizerState {
	c := *s
	c.Items = make(map[string]*totalizerItemState, len(s.Items))
	for k, v := range s.Items {
		item := *v
		c.Items[k] = &item
	}
	return &c
}

// item is the state of an item (created when the node got a new item).
func (s *totalizerState) item(name string) *totalizerItemState {
	if s.Items == nil {
		s.Items = map[string]*totalizerItemState{}
	}
	it, ok := s.Items[name]
	if !ok {
		it = &totalizerItemState{}
		s.Items[name] = it
	}
	return it
}

// roll closes the days that ended before now.
func (c *totalizerConfig) roll(s *totalizerState, key string, now time.Time, out *totalizerOutcome) {
	for {
		_, _, end := dayPeriod(c.Location, time.UnixMilli(s.PeriodStart))
		if now.Before(end) {
			return
		}
		out.Summaries = append(out.Summaries, c.summary(s, key, end, true))
		name, start, _ := dayPeriod(c.Location, end)
		s.Period, s.PeriodStart, s.LastSummary = name, start.UnixMilli(), end.UnixMilli()
		for _, it := range s.Items {
			it.Amount, it.RateMax, it.HasRateMx, it.RateTime = 0, 0, false, 0
			it.Gaps, it.Resets, it.Rejected, it.Readings = 0, 0, 0, 0
		}
	}
}

// observe applies a message of time `now` that arrived at `arrival`.
func (c *totalizerConfig) observe(state *totalizerState, key, topic string, payload map[string]any, now, arrival time.Time) totalizerOutcome {
	var out totalizerOutcome
	var s *totalizerState
	if state == nil {
		s = c.newState(topic, now)
	} else {
		s = cloneTotalizerState(state)
		c.roll(s, key, now, &out)
	}
	s.Topic = topic
	s.LastTime = maxInt64(s.LastTime, now.UnixMilli())
	s.LastArrival = arrival.UnixMilli()
	for _, item := range c.Items {
		c.apply(item, s.item(item.Name), topic, payload, now)
	}
	out.Next = s
	return out
}

// apply adds what a message means for an item.
func (c *totalizerConfig) apply(item totalizerItem, it *totalizerItemState, topic string, payload map[string]any, now time.Time) {
	var value float64
	var hasValue bool
	if item.Field != "" {
		if raw, ok := lookupPath(topic, payload, item.Field); ok {
			value, hasValue = toNumber(raw)
		}
	}
	add := func(amount float64) {
		it.Amount += amount * item.Factor
		it.Total += amount * item.Factor
	}
	t := now.UnixMilli()
	switch item.Mode {
	case totalizerEvents:
		if item.Field != "" && hasValue {
			add(value)
		} else if item.Field == "" {
			add(1)
		} else if _, present := lookupPath(topic, payload, item.Field); present {
			add(1) // the field is there but is not a number: one event
		} else {
			return
		}
		it.Readings++
	case totalizerCounter:
		if !hasValue {
			return
		}
		it.Readings++
		if it.HasLast && t < it.LastTime {
			return // older than the reference: out of order
		}
		if it.HasLast {
			delta := value - it.Last
			if delta < 0 {
				it.Resets++
				if item.RolloverAt > 0 && it.Last <= item.RolloverAt {
					delta = item.RolloverAt - it.Last + value
				} else {
					delta = value // restarted from zero
				}
			}
			if item.MaxStep > 0 && delta > item.MaxStep {
				it.Rejected++
			} else {
				add(delta)
			}
		}
		it.HasLast, it.Last, it.LastTime = true, value, t
	case totalizerRate:
		if !hasValue {
			return
		}
		it.Readings++
		if !it.HasRateMx || value > it.RateMax {
			it.RateMax, it.HasRateMx = value, true
		}
		if it.HasLast && t < it.LastTime {
			return
		}
		if it.HasLast {
			dt := time.Duration(t-it.LastTime) * time.Millisecond
			if item.MaxGap > 0 && dt > item.MaxGap {
				it.Gaps++
			} else if dt > 0 {
				add((it.Last + value) / 2 * dt.Seconds() / item.TimeUnit.Seconds())
				it.RateTime += dt.Seconds()
			}
		}
		it.HasLast, it.Last, it.LastTime = true, value, t
	}
}

// tick is the clock: the end of the day (when the signal is idle, or always
// with arrival time) and the periodic summary.
func (c *totalizerConfig) tick(state *totalizerState, key string, now time.Time) totalizerOutcome {
	var out totalizerOutcome
	if state == nil {
		return out
	}
	s := cloneTotalizerState(state)
	if c.TimePath == "" || now.Sub(time.UnixMilli(s.LastArrival)) >= idleClose {
		c.roll(s, key, now, &out)
	}
	if c.SummaryEvery > 0 && now.Sub(time.UnixMilli(maxInt64(s.LastSummary, s.PeriodStart))) >= c.SummaryEvery {
		until := now
		if c.TimePath != "" && s.LastTime > s.PeriodStart && s.LastTime < now.UnixMilli() {
			until = time.UnixMilli(s.LastTime)
		}
		out.Summaries = append(out.Summaries, c.summary(s, key, until, false))
		s.LastSummary = now.UnixMilli()
	}
	out.Next = s
	return out
}

// summary of the day up to `until` (final: the day ended).
func (c *totalizerConfig) summary(s *totalizerState, key string, until time.Time, final bool) map[string]any {
	values := map[string]any{}
	for _, item := range c.Items {
		it := s.item(item.Name)
		v := map[string]any{
			"amount":   roundSignificant(it.Amount),
			"total":    roundSignificant(it.Total),
			"unit":     item.Unit,
			"mode":     item.Mode,
			"readings": it.Readings,
		}
		switch item.Mode {
		case totalizerCounter:
			if it.HasLast {
				v["lastReading"] = it.Last
			}
			if it.Resets > 0 {
				v["resets"] = it.Resets
			}
			if it.Rejected > 0 {
				v["rejected"] = it.Rejected
			}
		case totalizerRate:
			if it.HasRateMx {
				v["maxRate"] = it.RateMax
			}
			if it.RateTime > 0 && item.Factor != 0 {
				// the mean rate over the integrated time, in the field's units
				v["meanRate"] = roundSignificant(it.Amount / item.Factor / (it.RateTime / item.TimeUnit.Seconds()))
			}
			if it.Gaps > 0 {
				v["gaps"] = it.Gaps
			}
		}
		values[item.Name] = v
	}
	e := map[string]any{
		"event":       "summary",
		"period":      s.Period,
		"periodStart": isoTime(time.UnixMilli(s.PeriodStart)),
		"until":       isoTime(until),
		"final":       final,
		"since":       isoTime(time.UnixMilli(s.Since)),
		"values":      values,
	}
	if key != "" {
		e["key"] = key
	}
	return e
}

// roundSignificant keeps 10 significant digits (the float sums of many
// small amounts do not show 0.30000000000000004).
func roundSignificant(v float64) float64 {
	if v == 0 || math.IsNaN(v) || math.IsInf(v, 0) {
		return v
	}
	digits := 10 - int(math.Ceil(math.Log10(math.Abs(v))))
	if digits < 0 {
		digits = 0
	}
	if digits > 12 {
		digits = 12
	}
	return roundTo(v, digits)
}
