package nodes

// Degradation node logic (pure): follows a health indicator over weeks or
// months and estimates its remaining useful life (RUL), the time until its
// trend reaches a failure threshold (dsp.EstimateRUL).
//
// The samples are averaged in buckets of an hour or a day (up to
// degradationMaxBuckets per key, so the history kept can be longer than
// the IoT database's retention); when a bucket closes, the trend is fitted
// on the closed buckets of the last windowDays and an estimate is sent.
// The health index goes from 100 % at the baseline (set, or the oldest
// bucket kept) to 0 % at the threshold.

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"pipelines/dsp"
)

const degradationMaxBuckets = 5000

type degradationConfig struct {
	Field        string
	KeyPath      string
	TimePath     string
	Location     *time.Location
	Bucket       string // "hour" or "day"
	WindowDays   float64
	Model        string // "linear" or "exponential"
	Threshold    float64
	Rising       bool
	Baseline     float64
	HasBaseline  bool
	MinPoints    int
	HistoryTopic string // asset topic ref whose stored messages are loaded at start; "": none
	HistoryField string // the field in the stored payloads
}

type degradationBucket struct {
	T   int64   `json:"t"` // start, ms
	Sum float64 `json:"s"`
	N   int     `json:"n"`
}

func (b degradationBucket) mean() float64 { return b.Sum / float64(b.N) }

type degradationState struct {
	Buckets []degradationBucket `json:"buckets"`
	Topic   string              `json:"topic,omitempty"`
}

type degradationOutcome struct {
	Estimates []map[string]any
	Next      *degradationState
}

func parseDegradationConfig(settings map[string]any, loc *time.Location) (*degradationConfig, error) {
	if loc == nil {
		loc = time.UTC
	}
	cfg := &degradationConfig{
		Field:        settingString(settings, "field", "payload.value"),
		KeyPath:      settingString(settings, "keyPath", ""),
		TimePath:     timePathSetting(settings),
		Location:     loc,
		Bucket:       settingString(settings, "bucket", "hour"),
		WindowDays:   settingNumber(settings, "windowDays", 30),
		Model:        settingString(settings, "model", "linear"),
		Rising:       settingString(settings, "direction", "rising") == "rising",
		MinPoints:    int(settingNumber(settings, "minPoints", 10)),
		HistoryTopic: settingString(settings, "historyTopicRef", ""),
	}
	threshold, ok := toNumber(settings["threshold"])
	if !ok {
		return nil, fmt.Errorf("the failure threshold is required")
	}
	cfg.Threshold = threshold
	if v, ok := toNumber(settings["baseline"]); ok {
		if text, isText := settings["baseline"].(string); !isText || strings.TrimSpace(text) != "" {
			cfg.Baseline, cfg.HasBaseline = v, true
		}
	}
	cfg.HistoryField = settingString(settings, "historyField", strings.TrimPrefix(cfg.Field, "payload."))
	direction := settingString(settings, "direction", "rising")
	switch {
	case cfg.Bucket != "hour" && cfg.Bucket != "day":
		return nil, fmt.Errorf("the bucket must be hour or day")
	case cfg.Model != "linear" && cfg.Model != "exponential":
		return nil, fmt.Errorf("the model must be linear or exponential")
	case direction != "rising" && direction != "falling":
		return nil, fmt.Errorf("the direction must be rising or falling")
	case cfg.WindowDays <= 0:
		return nil, fmt.Errorf("the trend window must be greater than 0 days")
	case cfg.MinPoints < 3:
		return nil, fmt.Errorf("at least 3 points are needed for a trend")
	case cfg.Model == "exponential" && cfg.Threshold <= 0:
		return nil, fmt.Errorf("the exponential model needs a threshold greater than 0")
	case cfg.HasBaseline && cfg.Baseline == cfg.Threshold:
		return nil, fmt.Errorf("the baseline cannot be the threshold")
	case cfg.HistoryTopic != "" && strings.HasPrefix(cfg.HistoryField, "topic"):
		return nil, fmt.Errorf("the history field must be a field of the stored payload")
	}
	if span := cfg.bucketLength(time.Now()); cfg.WindowDays*24*float64(time.Hour) < float64(cfg.MinPoints)*float64(span) {
		return nil, fmt.Errorf("the trend window holds fewer buckets than the minimum points")
	}
	return cfg, nil
}

// bucketStart is the start of the bucket of t (local hours and days).
func (c *degradationConfig) bucketStart(t time.Time) time.Time {
	l := t.In(c.Location)
	if c.Bucket == "day" {
		return time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, c.Location)
	}
	return time.Date(l.Year(), l.Month(), l.Day(), l.Hour(), 0, 0, 0, c.Location)
}

// bucketLength is the length of the bucket that starts at start.
func (c *degradationConfig) bucketLength(start time.Time) time.Duration {
	if c.Bucket == "day" {
		return start.AddDate(0, 0, 1).Sub(start)
	}
	return time.Hour
}

// SQL interval and time_bucket width of the buckets (history loading).
func (c *degradationConfig) bucketInterval() string {
	if c.Bucket == "day" {
		return "1 day"
	}
	return "1 hour"
}

func cloneDegradationState(s *degradationState) *degradationState {
	c := *s
	c.Buckets = append([]degradationBucket(nil), s.Buckets...)
	return &c
}

// add puts a sample in its bucket and says whether a bucket was closed by
// it (a newer bucket opened).
func (s *degradationState) add(t int64, value float64) bool {
	n := len(s.Buckets)
	switch {
	case n == 0 || t > s.Buckets[n-1].T:
		s.Buckets = append(s.Buckets, degradationBucket{T: t, Sum: value, N: 1})
		s.trim()
		return n > 0
	case t == s.Buckets[n-1].T:
		s.Buckets[n-1].Sum += value
		s.Buckets[n-1].N++
		return false
	}
	// a late sample: its bucket, or a new one in its place
	i := sort.Search(n, func(i int) bool { return s.Buckets[i].T >= t })
	if i < n && s.Buckets[i].T == t {
		s.Buckets[i].Sum += value
		s.Buckets[i].N++
		return false
	}
	if i == 0 && n >= degradationMaxBuckets {
		return false // older than everything kept
	}
	s.Buckets = append(s.Buckets, degradationBucket{})
	copy(s.Buckets[i+1:], s.Buckets[i:])
	s.Buckets[i] = degradationBucket{T: t, Sum: value, N: 1}
	s.trim()
	return false
}

// merge adds buckets loaded from the history where there are none.
func (s *degradationState) merge(history []degradationBucket) int {
	have := make(map[int64]bool, len(s.Buckets))
	for _, b := range s.Buckets {
		have[b.T] = true
	}
	added := 0
	for _, b := range history {
		if b.N > 0 && !have[b.T] {
			s.Buckets = append(s.Buckets, b)
			have[b.T] = true
			added++
		}
	}
	sort.Slice(s.Buckets, func(i, j int) bool { return s.Buckets[i].T < s.Buckets[j].T })
	s.trim()
	return added
}

func (s *degradationState) trim() {
	if extra := len(s.Buckets) - degradationMaxBuckets; extra > 0 {
		s.Buckets = append([]degradationBucket(nil), s.Buckets[extra:]...)
	}
}

// observe adds a sample of a message of time `now`.
func (c *degradationConfig) observe(state *degradationState, key, topic string, value float64, now time.Time) degradationOutcome {
	var out degradationOutcome
	s := &degradationState{}
	if state != nil {
		s = cloneDegradationState(state)
	}
	s.Topic = topic
	if s.add(c.bucketStart(now).UnixMilli(), value) {
		out.Estimates = append(out.Estimates, c.estimate(s, key))
	}
	out.Next = s
	return out
}

// estimate is the trend of the closed buckets (all but the newest) of the
// last windowDays.
func (c *degradationConfig) estimate(s *degradationState, key string) map[string]any {
	closed := s.Buckets[:len(s.Buckets)-1]
	last := closed[len(closed)-1]
	lastStart := time.UnixMilli(last.T)
	end := lastStart.Add(c.bucketLength(lastStart))
	from := end.Add(-time.Duration(c.WindowDays * 24 * float64(time.Hour)))
	var xs, ys []float64
	for _, b := range closed {
		start := time.UnixMilli(b.T)
		if start.Before(from) {
			continue
		}
		mid := start.Add(c.bucketLength(start) / 2)
		xs = append(xs, mid.Sub(from).Hours()/24)
		ys = append(ys, b.mean())
	}
	xNow := end.Sub(from).Hours() / 24
	e := map[string]any{
		"event":      "estimate",
		"at":         isoTime(end),
		"value":      last.mean(),
		"model":      c.Model,
		"threshold":  c.Threshold,
		"direction":  map[bool]string{true: "rising", false: "falling"}[c.Rising],
		"points":     len(xs),
		"windowFrom": isoTime(from),
	}
	if key != "" {
		e["key"] = key
	}
	if len(xs) < c.MinPoints {
		e["status"] = "insufficient"
		e["message"] = fmt.Sprintf("%d of the %d points needed for a trend", len(xs), c.MinPoints)
		return e
	}
	est, err := dsp.EstimateRUL(xs, ys, c.Model, c.Threshold, c.Rising, xNow)
	if err != nil {
		e["status"] = "error"
		e["message"] = err.Error()
		return e
	}
	e["status"] = est.Status
	e["fitted"] = roundSignificant(est.Current)
	e["r2"] = roundTo(est.Fit.R2, 4)
	if c.Model == "exponential" {
		e["growthPerDay"] = roundSignificant(est.Rate)
	} else {
		e["slopePerDay"] = roundSignificant(est.Rate)
	}
	baseline, hasBaseline := c.Baseline, c.HasBaseline
	if !hasBaseline && len(s.Buckets) > 0 {
		baseline, hasBaseline = s.Buckets[0].mean(), true
	}
	if hasBaseline && baseline != c.Threshold {
		health := 100 * (c.Threshold - est.Current) / (c.Threshold - baseline)
		e["healthPercent"] = roundTo(math.Max(0, math.Min(100, health)), 1)
		e["baseline"] = roundSignificant(baseline)
	}
	days := func(v float64) any {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil
		}
		return roundTo(v, 2)
	}
	e["rulDays"] = days(est.RUL)
	e["rulLowDays"] = days(est.RULLow)
	e["rulHighDays"] = days(est.RULHigh)
	switch est.Status {
	case "degrading":
		e["failureDate"] = isoTime(end.Add(time.Duration(est.RUL * 24 * float64(time.Hour))))
		e["message"] = fmt.Sprintf("Remaining useful life %.1f days (%s to %s)", est.RUL, dayText(est.RULLow), dayText(est.RULHigh))
	case "exceeded":
		e["message"] = "The trend has reached the failure threshold"
	case "stable":
		e["message"] = "No degradation towards the threshold"
	}
	return e
}

func dayText(v float64) string {
	if math.IsInf(v, 1) || math.IsNaN(v) {
		return "no limit"
	}
	return fmt.Sprintf("%.1f", v)
}
