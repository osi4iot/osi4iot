package dsp

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

// Detrend removes the least-squares line from x, in place, and returns x.
func Detrend(x []float64) []float64 {
	n := float64(len(x))
	if len(x) < 2 {
		return x
	}
	var sum, sumIdx, sumValIdx float64
	for i, v := range x {
		sum += v
		sumIdx += float64(i)
		sumValIdx += float64(i) * v
	}
	sumIdx2 := (n - 1) * n * (2*n - 1) / 6 // sum of i^2, i = 0..n-1
	slope := 0.0
	if den := n*sumIdx2 - sumIdx*sumIdx; math.Abs(den) > 1e-12 {
		slope = (n*sumValIdx - sumIdx*sum) / den
	}
	intercept := sum/n - slope*sumIdx/n
	for i := range x {
		x[i] -= intercept + slope*float64(i)
	}
	return x
}

// SortSeries returns copies of times and values sorted by time.
func SortSeries(times, values []float64) ([]float64, []float64) {
	idx := make([]int, len(times))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool { return times[idx[a]] < times[idx[b]] })
	st := make([]float64, len(idx))
	sv := make([]float64, len(idx))
	for i, k := range idx {
		st[i], sv[i] = times[k], values[k]
	}
	return st, sv
}

// EstimateSamplingRate estimates the sampling rate (Hz) of sorted times (s)
// from the intervals between them: "median" (robust to gaps), "mean" or
// "min". Repeated times (intervals of 0 or less) are left out.
func EstimateSamplingRate(times []float64, method string) (float64, error) {
	if method != "min" && method != "median" && method != "mean" {
		return 0, fmt.Errorf("invalid method %q: must be 'min', 'median' or 'mean'", method)
	}
	var dts []float64
	for i := 1; i < len(times); i++ {
		if dt := times[i] - times[i-1]; dt > 0 {
			dts = append(dts, dt)
		}
	}
	if len(dts) == 0 {
		return 0, errors.New("need at least two different times")
	}
	var dt float64
	switch method {
	case "min":
		dt = dts[0]
		for _, v := range dts[1:] {
			dt = math.Min(dt, v)
		}
	case "median":
		sort.Float64s(dts)
		dt = dts[len(dts)/2]
	default:
		for _, v := range dts {
			dt += v
		}
		dt /= float64(len(dts))
	}
	return 1 / dt, nil
}

// InterpolationConfig configures InterpolateToUniform.
type InterpolationConfig struct {
	TargetFs     float64 // sampling rate of the grid (Hz)
	StartTime    float64 // first time of the grid; 0: the first sample
	EndTime      float64 // last time of the grid; 0: the last sample
	ExtrapolMode string  // outside the samples: "zero", "constant" or "linear"
}

// Validate reports every invalid parameter of the configuration.
func (c InterpolationConfig) Validate() error {
	var errs []error
	if !(c.TargetFs > 0) {
		errs = append(errs, fmt.Errorf("invalid targetFs %g: must be positive", c.TargetFs))
	}
	if c.ExtrapolMode != "zero" && c.ExtrapolMode != "constant" && c.ExtrapolMode != "linear" {
		errs = append(errs, fmt.Errorf("invalid extrapolMode %q: must be 'zero', 'constant' or 'linear'", c.ExtrapolMode))
	}
	if c.StartTime < 0 || c.EndTime < 0 {
		errs = append(errs, fmt.Errorf("invalid time range [%g, %g]: times must not be negative", c.StartTime, c.EndTime))
	}
	if c.StartTime != 0 && c.EndTime != 0 && c.EndTime <= c.StartTime {
		errs = append(errs, fmt.Errorf("invalid time range: startTime %g must be before endTime %g", c.StartTime, c.EndTime))
	}
	return errors.Join(errs...)
}

// InterpolateToUniform resamples (times, values) on a uniform grid by
// linear interpolation. Gaps in the data are interpolated across: use
// UniformPieces to keep them out.
func InterpolateToUniform(times, values []float64, c InterpolationConfig) ([]float64, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}
	if len(times) != len(values) {
		return nil, errors.New("times and values must have the same length")
	}
	if len(times) < 2 {
		return nil, errors.New("need at least 2 samples")
	}
	st, sv := SortSeries(times, values)
	start, end := c.StartTime, c.EndTime
	if start == 0 {
		start = st[0]
	}
	if end == 0 {
		end = st[len(st)-1]
	}
	if end <= start {
		return nil, errors.New("the time range is empty")
	}
	dt := 1 / c.TargetFs
	n := int(math.Floor((end-start)/dt+1e-9)) + 1
	out := make([]float64, n)
	for i := range out {
		out[i] = interpolate(st, sv, start+float64(i)*dt, c.ExtrapolMode)
	}
	return out, nil
}

// UniformPieces splits sorted samples where the gap between two of them is
// longer than maxGap (s), and resamples each piece of at least minLen
// samples on a uniform grid at fs. For spectra of data with interruptions:
// the gaps are never filled.
func UniformPieces(times, values []float64, fs, maxGap float64, minLen int) [][]float64 {
	var pieces [][]float64
	start := 0
	flush := func(end int) { // samples [start, end)
		if end-start < 2 {
			return
		}
		t, v := times[start:end], values[start:end]
		x, err := InterpolateToUniform(t, v, InterpolationConfig{TargetFs: fs, StartTime: t[0], EndTime: t[len(t)-1], ExtrapolMode: "constant"})
		if err == nil && len(x) >= minLen {
			pieces = append(pieces, x)
		}
	}
	for i := 1; i <= len(times); i++ {
		if i == len(times) || times[i]-times[i-1] > maxGap {
			flush(i)
			start = i
		}
	}
	return pieces
}

func interpolate(times, values []float64, t float64, mode string) float64 {
	n := len(times)
	if t < times[0] {
		return extrapolate(times, values, t, true, mode)
	}
	if t > times[n-1] {
		return extrapolate(times, values, t, false, mode)
	}
	i := sort.Search(n, func(k int) bool { return times[k] > t }) - 1
	if i >= n-1 {
		return values[n-1]
	}
	dt := times[i+1] - times[i]
	if math.Abs(dt) < 1e-12 {
		return values[i]
	}
	a := (t - times[i]) / dt
	return values[i]*(1-a) + values[i+1]*a
}

func extrapolate(times, values []float64, t float64, left bool, mode string) float64 {
	n := len(values)
	switch mode {
	case "zero":
		return 0
	case "linear":
		if n >= 2 {
			if left && times[1] != times[0] {
				return values[0] + (values[1]-values[0])/(times[1]-times[0])*(t-times[0])
			}
			if !left && times[n-1] != times[n-2] {
				return values[n-1] + (values[n-1]-values[n-2])/(times[n-1]-times[n-2])*(t-times[n-1])
			}
		}
	}
	if left {
		return values[0]
	}
	return values[n-1]
}
