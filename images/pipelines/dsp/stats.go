package dsp

// Basic statistics of samples, shared by the Window, Vibration and Anomaly
// nodes and by the scripts (go.dsp).

import (
	"math"
	"sort"
)

// Moments are the descriptive statistics of a set of samples.
type Moments struct {
	N        int     `json:"n"`
	Mean     float64 `json:"mean"`
	Std      float64 `json:"std"`      // sample standard deviation (n-1)
	RMS      float64 `json:"rms"`      // root mean square (with the mean)
	Min      float64 `json:"min"`      //
	Max      float64 `json:"max"`      //
	Skewness float64 `json:"skewness"` // third standardized moment (0 for a symmetric distribution)
	Kurtosis float64 `json:"kurtosis"` // fourth standardized moment, not excess (3 for a normal distribution)
}

// ComputeMoments computes the moments of x (zero values when x is empty;
// skewness and kurtosis 0 when all the samples are equal).
func ComputeMoments(x []float64) Moments {
	m := Moments{N: len(x)}
	if len(x) == 0 {
		return m
	}
	m.Min, m.Max = x[0], x[0]
	sum, sumSq := 0.0, 0.0
	for _, v := range x {
		sum += v
		sumSq += v * v
		m.Min = math.Min(m.Min, v)
		m.Max = math.Max(m.Max, v)
	}
	n := float64(len(x))
	m.Mean = sum / n
	m.RMS = math.Sqrt(sumSq / n)
	var m2, m3, m4 float64
	for _, v := range x {
		d := v - m.Mean
		d2 := d * d
		m2 += d2
		m3 += d2 * d
		m4 += d2 * d2
	}
	if len(x) > 1 {
		m.Std = math.Sqrt(m2 / (n - 1))
	}
	// population moments for skewness and kurtosis (as scipy.stats with bias=True)
	m2 /= n
	m3 /= n
	m4 /= n
	if m2 > 0 {
		m.Skewness = m3 / math.Pow(m2, 1.5)
		m.Kurtosis = m4 / (m2 * m2)
	}
	return m
}

// Percentile of sorted samples (p in 0..100), with linear interpolation
// between the closest ranks (numpy's default). NaN when empty.
func Percentile(sorted []float64, p float64) float64 {
	switch len(sorted) {
	case 0:
		return math.NaN()
	case 1:
		return sorted[0]
	}
	p = math.Max(0, math.Min(100, p))
	rank := p / 100 * float64(len(sorted)-1)
	lo := int(math.Floor(rank))
	hi := int(math.Ceil(rank))
	return sorted[lo] + (sorted[hi]-sorted[lo])*(rank-float64(lo))
}

// SortedCopy returns a sorted copy of x.
func SortedCopy(x []float64) []float64 {
	s := append([]float64(nil), x...)
	sort.Float64s(s)
	return s
}
