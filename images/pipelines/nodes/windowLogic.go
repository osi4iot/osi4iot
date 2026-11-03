package nodes

// Window aggregate node logic (pure): statistics of numeric fields over a
// window of messages (count) or of time, fixed (tumbling) or sliding.

import (
	"fmt"
	"math"
	"time"

	"pipelines/dsp"
)

// windowMaxSamples caps the samples kept per partition key (sliding
// windows and percentiles keep them; the rest only accumulators).
const windowMaxSamples = 5000

// windowCloseGrace is how long after its end a time window is closed by the
// clock when no later message closed it.
const windowCloseGrace = 2 * time.Second

var windowStatNames = []string{"count", "sum", "mean", "min", "max", "first", "last", "range", "rms", "std", "p50", "p90", "p95", "p99"}

var windowPercentiles = map[string]float64{"p50": 50, "p90": 90, "p95": 95, "p99": 99}

type windowConfig struct {
	Fields      []string
	Labels      []string
	Type        string // "count" or "time"
	Size        int
	Duration    time.Duration
	Mode        string // "tumbling" or "sliding"
	Stats       []string
	KeyPath     string
	TimePath    string
	MaxSamples  int
	needSamples bool
}

type windowAcc struct {
	N     int64   `json:"n"`
	Sum   float64 `json:"sum"`
	SumSq float64 `json:"sumSq"`
	Min   float64 `json:"min"`
	Max   float64 `json:"max"`
	First float64 `json:"first"`
	Last  float64 `json:"last"`
}

type windowRow struct {
	T int64      `json:"t"`
	V []*float64 `json:"v"` // one per field; nil: the message had no value
}

// windowState is the state of one partition key.
type windowState struct {
	Topic     string      `json:"topic,omitempty"`
	Start     int64       `json:"start,omitempty"` // ms; time windows: the window's start
	End       int64       `json:"end,omitempty"`   // ms; time tumbling windows: the window's end
	LastT     int64       `json:"lastT,omitempty"` // ms; the last message
	Count     int         `json:"count,omitempty"` // messages in the window
	Acc       []windowAcc `json:"acc,omitempty"`
	Rows      []windowRow `json:"rows,omitempty"`
	ClosedEnd int64       `json:"closedEnd,omitempty"` // ms; end of the last time window emitted
	Truncated bool        `json:"truncated,omitempty"`
}

func (s *windowState) empty() bool {
	return s == nil || s.Count == 0
}

func parseWindowConfig(settings map[string]any) (*windowConfig, error) {
	cfg := &windowConfig{
		Fields:     settingStrings(settings, "fields"),
		Type:       settingString(settings, "windowType", "count"),
		Size:       int(settingNumber(settings, "size", 10)),
		Duration:   time.Duration(settingNumber(settings, "durationSeconds", 60) * float64(time.Second)),
		Mode:       settingString(settings, "mode", "tumbling"),
		Stats:      settingStrings(settings, "stats"),
		KeyPath:    settingString(settings, "keyPath", ""),
		TimePath:   settingString(settings, "timePath", ""),
		MaxSamples: windowMaxSamples,
	}
	if len(cfg.Fields) == 0 {
		return nil, fmt.Errorf("at least one numeric field is required")
	}
	cfg.Labels = fieldLabels(cfg.Fields)
	switch cfg.Type {
	case "count":
		if cfg.Size < 1 {
			return nil, fmt.Errorf("the window size must be at least 1 message")
		}
		if cfg.Mode == "sliding" && cfg.Size > windowMaxSamples {
			return nil, fmt.Errorf("a sliding window keeps at most %d messages", windowMaxSamples)
		}
	case "time":
		if cfg.Duration < time.Second {
			return nil, fmt.Errorf("the window duration must be at least 1 second")
		}
	default:
		return nil, fmt.Errorf("windowType must be count or time")
	}
	if cfg.Mode != "tumbling" && cfg.Mode != "sliding" {
		return nil, fmt.Errorf("mode must be tumbling or sliding")
	}
	if len(cfg.Stats) == 0 {
		cfg.Stats = []string{"count", "mean", "min", "max"}
	}
	for _, stat := range cfg.Stats {
		known := false
		for _, name := range windowStatNames {
			known = known || name == stat
		}
		if !known {
			return nil, fmt.Errorf("unknown statistic %q", stat)
		}
		if _, isPercentile := windowPercentiles[stat]; isPercentile {
			cfg.needSamples = true
		}
	}
	if cfg.Mode == "sliding" {
		cfg.needSamples = true
	}
	return cfg, nil
}

// values reads the fields of a message (nil where there is no number).
func (c *windowConfig) values(topic string, payload map[string]any) ([]*float64, bool) {
	out := make([]*float64, len(c.Fields))
	found := false
	for i, path := range c.Fields {
		if raw, ok := lookupPath(topic, payload, path); ok {
			if f, isNumber := toNumber(raw); isNumber {
				v := f
				out[i] = &v
				found = true
			}
		}
	}
	return out, found
}

// windowOutcome is what a message or the clock did to a key's window.
type windowOutcome struct {
	Emit    map[string]any // the statistics to send, or nil
	Next    *windowState   // the state to store (nil: delete it)
	Ignored string         // why the message was not used, or ""
}

// add adds a message to its key's window.
func (c *windowConfig) add(state *windowState, topic string, payload map[string]any, at time.Time) windowOutcome {
	values, ok := c.values(topic, payload)
	if !ok {
		return windowOutcome{Next: state, Ignored: "no numeric value in the window's fields"}
	}
	t := at.UnixMilli()
	next := &windowState{}
	if state != nil {
		*next = *state
		next.Acc = append([]windowAcc(nil), state.Acc...)
		next.Rows = append([]windowRow(nil), state.Rows...)
	}
	next.Topic = topic

	var emit map[string]any
	switch {
	case c.Type == "time" && c.Mode == "tumbling":
		d := c.Duration.Milliseconds()
		start := t - mod(t, d)
		if next.ClosedEnd > 0 && t < next.ClosedEnd {
			return windowOutcome{Next: state, Ignored: "late: its window was already emitted"}
		}
		if !next.empty() && start < next.Start {
			return windowOutcome{Next: state, Ignored: "late: older than the open window"}
		}
		if !next.empty() && start > next.Start {
			emit = c.result(next)
			next = &windowState{Topic: topic, ClosedEnd: next.End}
		}
		if next.empty() {
			next.Start, next.End = start, start+d
		}
		c.push(next, values, t)
	case c.Type == "time": // sliding
		c.push(next, values, t)
		from := t - c.Duration.Milliseconds()
		kept := next.Rows[:0:0]
		for _, row := range next.Rows {
			if row.T > from {
				kept = append(kept, row)
			}
		}
		next.Rows = kept
		next.Count = len(kept)
		next.Start = from
		emit = c.result(next)
	case c.Mode == "sliding": // count
		c.push(next, values, t)
		if len(next.Rows) > c.Size {
			next.Rows = next.Rows[len(next.Rows)-c.Size:]
		}
		next.Count = len(next.Rows)
		next.Start = next.Rows[0].T
		emit = c.result(next)
	default: // count, tumbling
		if next.empty() {
			next.Start = t
		}
		c.push(next, values, t)
		if next.Count >= c.Size {
			emit = c.result(next)
			next = nil
		}
	}
	return windowOutcome{Emit: emit, Next: next}
}

// closeDue closes a time tumbling window whose end has passed (by the
// clock: no later message came to close it).
func (c *windowConfig) closeDue(state *windowState, now time.Time) windowOutcome {
	if c.Type != "time" || c.Mode != "tumbling" || state.empty() {
		return windowOutcome{Next: state}
	}
	if now.Before(time.UnixMilli(state.End).Add(windowCloseGrace)) {
		return windowOutcome{Next: state}
	}
	return windowOutcome{
		Emit: c.result(state),
		Next: &windowState{Topic: state.Topic, ClosedEnd: state.End},
	}
}

// push adds one message's values to the window.
func (c *windowConfig) push(s *windowState, values []*float64, t int64) {
	s.Count++
	s.LastT = t
	if c.needSamples {
		s.Rows = append(s.Rows, windowRow{T: t, V: values})
		if len(s.Rows) > c.MaxSamples {
			s.Rows = s.Rows[len(s.Rows)-c.MaxSamples:]
			s.Truncated = true
		}
		return
	}
	if len(s.Acc) != len(values) {
		s.Acc = make([]windowAcc, len(values))
	}
	for i, v := range values {
		if v == nil {
			continue
		}
		a := &s.Acc[i]
		if a.N == 0 {
			a.Min, a.Max, a.First = *v, *v, *v
		}
		a.N++
		a.Sum += *v
		a.SumSq += *v * *v
		a.Min = math.Min(a.Min, *v)
		a.Max = math.Max(a.Max, *v)
		a.Last = *v
	}
}

// result is the output payload of a window. The partition key is added by
// the node.
func (c *windowConfig) result(s *windowState) map[string]any {
	out := map[string]any{
		"count":       s.Count,
		"windowStart": isoTime(time.UnixMilli(s.Start)),
		"windowEnd":   isoTime(time.UnixMilli(s.LastT)),
	}
	if c.Type == "time" && c.Mode == "tumbling" {
		out["windowEnd"] = isoTime(time.UnixMilli(s.End))
	}
	if s.Truncated {
		out["truncated"] = true
	}
	for i, label := range c.Labels {
		var acc windowAcc
		var samples []float64
		if c.needSamples {
			for _, row := range s.Rows {
				if i < len(row.V) && row.V[i] != nil {
					samples = append(samples, *row.V[i])
				}
			}
			acc = accumulate(samples)
		} else if i < len(s.Acc) {
			acc = s.Acc[i]
		}
		out[label] = c.stats(acc, samples)
	}
	return out
}

func accumulate(samples []float64) windowAcc {
	var a windowAcc
	for _, v := range samples {
		if a.N == 0 {
			a.Min, a.Max, a.First = v, v, v
		}
		a.N++
		a.Sum += v
		a.SumSq += v * v
		a.Min = math.Min(a.Min, v)
		a.Max = math.Max(a.Max, v)
		a.Last = v
	}
	return a
}

// stats computes the chosen statistics of one field.
func (c *windowConfig) stats(a windowAcc, samples []float64) map[string]any {
	out := map[string]any{}
	if a.N == 0 {
		out["count"] = 0
		return out
	}
	n := float64(a.N)
	var sorted []float64
	for _, stat := range c.Stats {
		switch stat {
		case "count":
			out[stat] = a.N
		case "sum":
			out[stat] = a.Sum
		case "mean":
			out[stat] = a.Sum / n
		case "min":
			out[stat] = a.Min
		case "max":
			out[stat] = a.Max
		case "first":
			out[stat] = a.First
		case "last":
			out[stat] = a.Last
		case "range":
			out[stat] = a.Max - a.Min
		case "rms":
			out[stat] = math.Sqrt(a.SumSq / n)
		case "std":
			// sample standard deviation (n-1)
			if a.N < 2 {
				out[stat] = 0.0
			} else {
				out[stat] = math.Sqrt(math.Max(0, (a.SumSq-a.Sum*a.Sum/n)/(n-1)))
			}
		default:
			p, ok := windowPercentiles[stat]
			if !ok || len(samples) == 0 {
				continue
			}
			if sorted == nil {
				sorted = dsp.SortedCopy(samples)
			}
			out[stat] = dsp.Percentile(sorted, p)
		}
	}
	return out
}

// mod is a modulo that is never negative.
func mod(a, b int64) int64 {
	m := a % b
	if m < 0 {
		m += b
	}
	return m
}
