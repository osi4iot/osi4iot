package dsp

// Anomaly detection without a trained model, sample by sample, with three
// methods:
//   - zscore: distance to the mean of a sliding window, in standard
//     deviations (good for spikes in roughly normal data);
//   - ewma:   EWMA control chart on a baseline learnt during a warm-up (good
//     for small persistent shifts: drift, a lost calibration);
//   - iqr:    Tukey fences on the quartiles of a sliding window (robust to
//     skewed data and to outliers).
// The state (AnomalyState) is plain JSON, so that it can be kept between
// messages. By default anomalous samples do not enter the baseline, so
// that an anomaly does not teach the detector that it is normal.

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

// AnomalyConfig configures a detector.
type AnomalyConfig struct {
	Method    string  `json:"method"`    // "zscore", "ewma" or "iqr"
	Window    int     `json:"window"`    // zscore, iqr: samples of the baseline
	Threshold float64 `json:"threshold"` // zscore: |z| (3); ewma: L (3); iqr: k (1.5)
	Lambda    float64 `json:"lambda"`    // ewma: weight of the newest sample (0.2)
	Warmup    int     `json:"warmup"`    // samples before judging
	Adapt     float64 `json:"adapt"`     // ewma: how fast the baseline follows the normal samples (0: frozen)
	// LearnAnomalies lets the anomalous samples into the baseline too
	LearnAnomalies bool `json:"learnAnomalies"`
}

// AnomalyMaxWindow caps the window of zscore and iqr (it is kept in the state).
const AnomalyMaxWindow = 5000

// WithDefaults fills the parameters left at 0.
func (c AnomalyConfig) WithDefaults() AnomalyConfig {
	if c.Method == "" {
		c.Method = "zscore"
	}
	if c.Window == 0 {
		c.Window = 100
	}
	if c.Threshold == 0 {
		switch c.Method {
		case "iqr":
			c.Threshold = 1.5
		default:
			c.Threshold = 3
		}
	}
	if c.Lambda == 0 {
		c.Lambda = 0.2
	}
	if c.Warmup == 0 {
		c.Warmup = 30
		if c.Method != "ewma" && c.Window < 30 {
			c.Warmup = c.Window
		}
	}
	return c
}

// Validate reports every problem of the configuration (after WithDefaults).
func (c AnomalyConfig) Validate() error {
	var problems []string
	switch c.Method {
	case "zscore", "ewma", "iqr":
	default:
		problems = append(problems, fmt.Sprintf("unknown method %q (zscore, ewma or iqr)", c.Method))
	}
	if c.Method != "ewma" {
		if c.Window < 4 || c.Window > AnomalyMaxWindow {
			problems = append(problems, fmt.Sprintf("the window must have 4 to %d samples", AnomalyMaxWindow))
		}
		if c.Warmup > c.Window {
			problems = append(problems, "the warm-up cannot be longer than the window")
		}
	}
	if c.Warmup < 2 {
		problems = append(problems, "the warm-up needs at least 2 samples")
	}
	if !(c.Threshold > 0) {
		problems = append(problems, "the threshold must be positive")
	}
	if c.Method == "ewma" && !(c.Lambda > 0 && c.Lambda <= 1) {
		problems = append(problems, "lambda must be in (0, 1]")
	}
	if c.Adapt < 0 || c.Adapt >= 1 {
		problems = append(problems, "the adaptation must be in [0, 1)")
	}
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

// AnomalyState is the state of a detector.
type AnomalyState struct {
	Window  []float64 `json:"window,omitempty"` // zscore, iqr
	N       int       `json:"n"`                // ewma: samples of the warm-up
	Mean    float64   `json:"mean"`             // ewma: baseline mean
	M2      float64   `json:"m2"`               // ewma: warm-up sum of squares (Welford)
	Var     float64   `json:"var"`              // ewma: baseline variance
	EWMA    float64   `json:"ewma"`             // ewma: the chart statistic
	Ready   bool      `json:"ready"`
	Samples int64     `json:"samples"` // samples seen
	Flagged int64     `json:"flagged"` // anomalies found
}

// AnomalyResult is the verdict on a sample. Score is in standard deviations
// (zscore, ewma) or in IQRs beyond the fence (iqr); nil when undefined
// (before the warm-up, or a constant baseline).
type AnomalyResult struct {
	Method    string   `json:"method"`
	Ready     bool     `json:"ready"`
	IsAnomaly bool     `json:"isAnomaly"`
	Score     *float64 `json:"score"`
	Lower     *float64 `json:"lower,omitempty"`
	Upper     *float64 `json:"upper,omitempty"`
	Baseline  *float64 `json:"baseline,omitempty"` // mean (zscore, ewma) or median (iqr)
	EWMA      *float64 `json:"ewma,omitempty"`
	Reason    string   `json:"reason,omitempty"`
}

func ptr(v float64) *float64 { return &v }

// Step judges a sample and updates the state.
func (c AnomalyConfig) Step(s *AnomalyState, x float64) AnomalyResult {
	r := AnomalyResult{Method: c.Method}
	if math.IsNaN(x) || math.IsInf(x, 0) {
		r.Reason = "not a number"
		return r
	}
	s.Samples++
	switch c.Method {
	case "ewma":
		c.stepEWMA(s, x, &r)
	case "iqr":
		c.stepWindow(s, x, &r, c.iqr)
	default:
		c.stepWindow(s, x, &r, c.zscore)
	}
	if r.IsAnomaly {
		s.Flagged++
	}
	return r
}

// stepWindow: zscore and iqr judge against the window, then the sample
// enters it (unless it is anomalous).
func (c AnomalyConfig) stepWindow(s *AnomalyState, x float64, r *AnomalyResult, judge func([]float64, float64, *AnomalyResult)) {
	if len(s.Window) >= c.Warmup {
		r.Ready = true
		s.Ready = true
		judge(s.Window, x, r)
	}
	if !r.IsAnomaly || c.LearnAnomalies {
		s.Window = append(s.Window, x)
		if len(s.Window) > c.Window {
			s.Window = append([]float64(nil), s.Window[len(s.Window)-c.Window:]...)
		}
	}
}

func (c AnomalyConfig) zscore(w []float64, x float64, r *AnomalyResult) {
	m := ComputeMoments(w)
	r.Baseline = ptr(m.Mean)
	if m.Std == 0 {
		r.IsAnomaly = x != m.Mean
		if r.IsAnomaly {
			r.Reason = "the baseline is constant"
		} else {
			r.Score = ptr(0)
		}
		return
	}
	z := (x - m.Mean) / m.Std
	r.Score = ptr(z)
	r.Lower, r.Upper = ptr(m.Mean-c.Threshold*m.Std), ptr(m.Mean+c.Threshold*m.Std)
	r.IsAnomaly = math.Abs(z) > c.Threshold
}

func (c AnomalyConfig) iqr(w []float64, x float64, r *AnomalyResult) {
	sorted := SortedCopy(w)
	q1, q3 := Percentile(sorted, 25), Percentile(sorted, 75)
	iqr := q3 - q1
	lower, upper := q1-c.Threshold*iqr, q3+c.Threshold*iqr
	r.Baseline = ptr(Percentile(sorted, 50))
	r.Lower, r.Upper = ptr(lower), ptr(upper)
	switch {
	case x > upper:
		r.IsAnomaly = true
		if iqr > 0 {
			r.Score = ptr((x - upper) / iqr)
		} else {
			r.Reason = "the baseline is constant"
		}
	case x < lower:
		r.IsAnomaly = true
		if iqr > 0 {
			r.Score = ptr(-(lower - x) / iqr)
		} else {
			r.Reason = "the baseline is constant"
		}
	default:
		r.Score = ptr(0)
	}
}

// stepEWMA: the warm-up learns the baseline (mean and variance); then the
// EWMA statistic is compared with its control limits, mean ± L σ √(λ/(2-λ)).
func (c AnomalyConfig) stepEWMA(s *AnomalyState, x float64, r *AnomalyResult) {
	if !s.Ready {
		s.N++
		d := x - s.Mean
		s.Mean += d / float64(s.N)
		s.M2 += d * (x - s.Mean)
		if s.N >= c.Warmup {
			s.Var = s.M2 / float64(s.N-1)
			s.EWMA = s.Mean
			s.Ready = true
		}
		return
	}
	r.Ready = true
	s.EWMA = c.Lambda*x + (1-c.Lambda)*s.EWMA
	sigma := math.Sqrt(s.Var) * math.Sqrt(c.Lambda/(2-c.Lambda))
	r.Baseline, r.EWMA = ptr(s.Mean), ptr(s.EWMA)
	if sigma == 0 {
		r.IsAnomaly = s.EWMA != s.Mean
		if r.IsAnomaly {
			r.Reason = "the baseline is constant"
		} else {
			r.Score = ptr(0)
		}
	} else {
		score := (s.EWMA - s.Mean) / sigma
		r.Score = ptr(score)
		r.Lower, r.Upper = ptr(s.Mean-c.Threshold*sigma), ptr(s.Mean+c.Threshold*sigma)
		r.IsAnomaly = math.Abs(score) > c.Threshold
	}
	if c.Adapt > 0 && (!r.IsAnomaly || c.LearnAnomalies) {
		d := x - s.Mean
		s.Mean += c.Adapt * d
		s.Var = (1 - c.Adapt) * (s.Var + c.Adapt*d*d)
	}
}

// DetectAnomalies runs a detector over a whole series (for scripts).
func DetectAnomalies(x []float64, c AnomalyConfig) ([]AnomalyResult, error) {
	c = c.WithDefaults()
	if err := c.Validate(); err != nil {
		return nil, err
	}
	s := &AnomalyState{}
	out := make([]AnomalyResult, len(x))
	for i, v := range x {
		out[i] = c.Step(s, v)
	}
	return out, nil
}
