package nodes

// Rainflow node logic: incremental rainflow counting of a stress (or
// strain) signal and its Palmgren-Miner damage, with dsp's counter and S-N
// curves; totals since the start and summaries per day.
//
// Time: each message is placed in time by its timestamp (timePath, by
// default payload.timestamp, which the Listen node always sets), so a
// delayed or replayed message goes to its own day; without one, or with
// timePath "", the arrival time is used. Timestamps ahead of the clock are
// taken as now. The clock only closes a day when the signal has been idle
// for idleClose, so that a replay of old data is not split by it.

import (
	"fmt"
	"math"
	"time"

	"pipelines/dsp"
)

type rainflowConfig struct {
	Field        string
	Scale        float64 // counted signal → stress (e.g. E in MPa for a strain)
	Gate         float64 // in stress units, after the scale
	Curve        dsp.SNCurve
	BinWidth     float64
	Units        string
	KeyPath      string
	Location     *time.Location
	SummaryEvery time.Duration
	DesignLife   float64 // years; 0: not set
	TimePath     string  // "": arrival time
}

// rainflowState is the state of one partition key.
type rainflowState struct {
	Counter      dsp.RainflowCounter `json:"counter"`
	Since        int64               `json:"since"`
	TotalDamage  float64             `json:"totalDamage"`
	TotalCycles  float64             `json:"totalCycles"`
	Period       string              `json:"period"`
	PeriodStart  int64               `json:"periodStart"`
	PeriodDamage float64             `json:"periodDamage"`
	PeriodCycles float64             `json:"periodCycles"`
	MaxRange     float64             `json:"maxRange"`
	Histogram    map[int]float64     `json:"histogram"`
	LastSummary  int64               `json:"lastSummary,omitempty"`
	Topic        string              `json:"topic,omitempty"`
	LastTime     int64               `json:"lastTime,omitempty"`    // latest message time
	LastArrival  int64               `json:"lastArrival,omitempty"` // wall clock of the latest message
}

func parseRainflowConfig(settings map[string]any, loc *time.Location) (*rainflowConfig, error) {
	cfg := &rainflowConfig{
		Field:        settingString(settings, "field", "payload.value"),
		Scale:        settingNumber(settings, "scale", 1),
		Gate:         settingNumber(settings, "gate", 0),
		BinWidth:     settingNumber(settings, "binWidth", 10),
		Units:        settingString(settings, "units", "MPa"),
		KeyPath:      settingString(settings, "keyPath", ""),
		Location:     loc,
		SummaryEvery: time.Duration(settingNumber(settings, "summaryEveryMinutes", 0) * float64(time.Minute)),
		DesignLife:   settingNumber(settings, "designLifeYears", 0),
		TimePath:     timePathSetting(settings),
	}
	if cfg.Location == nil {
		cfg.Location = time.UTC
	}
	if cfg.Scale == 0 {
		return nil, fmt.Errorf("the scale cannot be 0")
	}
	if cfg.Gate < 0 || cfg.BinWidth <= 0 || cfg.SummaryEvery < 0 || cfg.DesignLife < 0 {
		return nil, fmt.Errorf("gate, bin width, summary interval and design life must be positive (gate may be 0)")
	}
	curve, err := parseSNCurve(settings)
	if err != nil {
		return nil, err
	}
	cfg.Curve = curve
	return cfg, nil
}

// parseSNCurve: a DNV-RP-C203 preset (curveSource "dnv": dnvCategory,
// dnvEnvironment) or custom lines [{m, logA}], plus cutoff and corrections
// (scf, thickness, tRef, k: overrides the preset's when set, dff).
func parseSNCurve(settings map[string]any) (dsp.SNCurve, error) {
	var curve dsp.SNCurve
	switch source := settingString(settings, "curveSource", "dnv"); source {
	case "dnv":
		c, err := dsp.DNVCurve(settingString(settings, "dnvCategory", "D"), settingString(settings, "dnvEnvironment", "air"))
		if err != nil {
			return curve, err
		}
		curve = c
	case "custom":
		curve.Name = "custom"
		for _, raw := range settingMaps(settings, "lines") {
			m, okM := toNumber(raw["m"])
			a, okA := toNumber(raw["logA"])
			if !okM || !okA {
				return curve, fmt.Errorf("each S-N line needs m and log a")
			}
			curve.Lines = append(curve.Lines, dsp.SNLine{M: m, LogA: a})
		}
	default:
		return curve, fmt.Errorf("curveSource must be dnv or custom")
	}
	curve.Cutoff = settingNumber(settings, "cutoff", 0)
	curve.SCF = settingNumber(settings, "scf", 0)
	curve.T = settingNumber(settings, "thickness", 0)
	curve.TRef = settingNumber(settings, "tRef", 0)
	if k, ok := toNumber(settings["k"]); ok {
		curve.K = k
	}
	curve.DFF = settingNumber(settings, "dff", 0)
	return curve, curve.Validate()
}

// samples reads the field: a number or an array of numbers, scaled.
func (c *rainflowConfig) samples(topic string, payload map[string]any) []float64 {
	raw, ok := lookupPath(topic, payload, c.Field)
	if !ok {
		return nil
	}
	return numbersOf(raw, c.Scale)
}

// numbersOf: a number or an array of numbers (the others skipped), scaled.
func numbersOf(raw any, scale float64) []float64 {
	if list, isList := raw.([]any); isList {
		out := make([]float64, 0, len(list))
		for _, item := range list {
			if v, ok := toNumber(item); ok {
				out = append(out, v*scale)
			}
		}
		return out
	}
	if list, isList := raw.([]float64); isList {
		out := make([]float64, len(list))
		for i, v := range list {
			out[i] = v * scale
		}
		return out
	}
	if v, ok := toNumber(raw); ok {
		return []float64{v * scale}
	}
	return nil
}

// dayPeriod is the calendar day that contains t, in loc.
func dayPeriod(loc *time.Location, t time.Time) (string, time.Time, time.Time) {
	local := t.In(loc)
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	return start.Format("2006-01-02"), start, start.AddDate(0, 0, 1)
}

type rainflowOutcome struct {
	Summaries []map[string]any
	Next      *rainflowState
}

func cloneRainflowState(s *rainflowState) *rainflowState {
	c := *s
	c.Counter.Residue = append([]float64(nil), s.Counter.Residue...)
	c.Histogram = make(map[int]float64, len(s.Histogram))
	for k, v := range s.Histogram {
		c.Histogram[k] = v
	}
	return &c
}

// roll closes the periods that ended before now.
func (c *rainflowConfig) roll(s *rainflowState, key string, now time.Time, out *rainflowOutcome) {
	for {
		_, _, end := dayPeriod(c.Location, time.UnixMilli(s.PeriodStart))
		if now.Before(end) {
			return
		}
		out.Summaries = append(out.Summaries, c.summary(s, key, end, true))
		name, start, _ := dayPeriod(c.Location, end)
		s.Period, s.PeriodStart = name, start.UnixMilli()
		s.PeriodDamage, s.PeriodCycles, s.MaxRange = 0, 0, 0
		s.Histogram = map[int]float64{}
		s.LastSummary = end.UnixMilli()
	}
}

// messageTime is the time of a message for the counting: its timestamp
// (not ahead of arrival), or the arrival time.
func (c *rainflowConfig) messageTime(topic string, payload map[string]any, arrival time.Time) time.Time {
	return eventTime(topic, payload, c.TimePath, arrival)
}

// observe counts the samples of a message of time `now` that arrived at `arrival`.
func (c *rainflowConfig) observe(state *rainflowState, key, topic string, samples []float64, now, arrival time.Time) rainflowOutcome {
	var out rainflowOutcome
	var s *rainflowState
	if state == nil {
		name, start, _ := dayPeriod(c.Location, now)
		s = &rainflowState{
			Counter: dsp.RainflowCounter{Gate: c.Gate, MaxStack: 1000},
			Since:   now.UnixMilli(), Period: name, PeriodStart: start.UnixMilli(),
			Histogram: map[int]float64{},
		}
	} else {
		s = cloneRainflowState(state)
		s.Counter.Gate = c.Gate
		c.roll(s, key, now, &out)
	}
	s.Topic = topic
	s.LastTime = maxInt64(s.LastTime, now.UnixMilli())
	s.LastArrival = arrival.UnixMilli()
	cycles := s.Counter.Push(samples...)
	for _, cy := range cycles {
		s.PeriodCycles += cy.Count
		s.TotalCycles += cy.Count
		s.MaxRange = math.Max(s.MaxRange, cy.Range)
		s.Histogram[int(math.Floor(cy.Range/c.BinWidth))] += cy.Count
	}
	damage := c.Curve.Damage(cycles)
	s.PeriodDamage += damage
	s.TotalDamage += damage
	out.Next = s
	return out
}

// tick: the end of the day and the periodic summary, by the clock.
func (c *rainflowConfig) tick(state *rainflowState, key string, now time.Time) rainflowOutcome {
	var out rainflowOutcome
	if state == nil {
		return out
	}
	s := cloneRainflowState(state)
	// with timestamps, the messages close their days; the clock only when the signal is idle
	if c.TimePath == "" || now.Sub(time.UnixMilli(s.LastArrival)) >= idleClose {
		c.roll(s, key, now, &out)
	}
	if c.SummaryEvery > 0 && now.Sub(time.UnixMilli(maxInt64(s.LastSummary, s.PeriodStart))) >= c.SummaryEvery {
		until := now
		if c.TimePath != "" && s.LastTime > s.PeriodStart && s.LastTime < now.UnixMilli() {
			until = time.UnixMilli(s.LastTime) // the data so far, e.g. while old data is replayed
		}
		out.Summaries = append(out.Summaries, c.summary(s, key, until, false))
		s.LastSummary = now.UnixMilli()
	}
	out.Next = s
	return out
}

const secondsPerYear = 365.25 * 24 * 3600

// summary of the period up to `until` (final: the day ended), with the
// totals since the start.
func (c *rainflowConfig) summary(s *rainflowState, key string, until time.Time, final bool) map[string]any {
	bins := make([]dsp.HistogramBin, 0, len(s.Histogram))
	for i := range s.Histogram {
		bins = append(bins, dsp.HistogramBin{From: float64(i) * c.BinWidth, To: float64(i+1) * c.BinWidth, Count: s.Histogram[i]})
	}
	sortBins(bins)
	residue := c.Curve.Damage(s.Counter.ResidueCycles())
	e := map[string]any{
		"event":               "summary",
		"period":              s.Period,
		"periodStart":         isoTime(time.UnixMilli(s.PeriodStart)),
		"until":               isoTime(until),
		"final":               final,
		"cycles":              s.PeriodCycles,
		"damage":              s.PeriodDamage,
		"maxRange":            s.MaxRange,
		"histogram":           bins,
		"units":               c.Units,
		"curve":               c.Curve.Name,
		"since":               isoTime(time.UnixMilli(s.Since)),
		"cyclesTotal":         s.TotalCycles,
		"damageTotal":         s.TotalDamage,
		"residueDamage":       residue,
		"lifeConsumedPercent": 100 * s.TotalDamage,
	}
	if key != "" {
		e["key"] = key
	}
	elapsed := until.Sub(time.UnixMilli(s.Since)).Seconds() / secondsPerYear
	// a rate only after a day of data, so that one storm is not extrapolated to years
	if elapsed >= 1.0/365.25 && s.TotalDamage > 0 {
		rate := s.TotalDamage / elapsed
		e["damageRatePerYear"] = rate
		e["remainingLifeYears"] = math.Max(0, 1-s.TotalDamage) / rate
		if c.DesignLife > 0 {
			e["rateToDesign"] = rate * c.DesignLife
		}
	}
	return e
}

func sortBins(b []dsp.HistogramBin) {
	for i := 1; i < len(b); i++ {
		for j := i; j > 0 && b[j].From < b[j-1].From; j-- {
			b[j], b[j-1] = b[j-1], b[j]
		}
	}
}
