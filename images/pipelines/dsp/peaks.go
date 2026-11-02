package dsp

import (
	"math"
	"sort"
)

// FindPeaks detects the peaks of a PSD: local maxima with a prominence of
// at least MinProminenceDB over a median-smoothed background (for coloured
// noise), at least MinDistanceHz apart, inside [MinFreq, MaxFreq]. Their
// frequency and level are refined with a parabola on the log-PSD; the -3 dB
// bandwidth is interpolated between bins, and gives Q and the damping ratio.
// Sorted by power, highest first.
func FindPeaks(freq, psd []float64, df float64, cfg WelchConfig) []Peak {
	n := len(psd)
	if n < 3 || len(freq) != n || !(df > 0) {
		return nil
	}

	win := cfg.SmoothBins
	if win < 5 || win%2 == 0 {
		win = 11
	}
	bg := medianSmooth(psd, win)
	psdDB := make([]float64, n)
	bgDB := make([]float64, n)
	for i := range psd {
		psdDB[i] = db(psd[i])
		bgDB[i] = db(bg[i])
	}

	minK, maxK := 1, n-2
	if cfg.MinFreq > 0 {
		minK = max(1, int(math.Ceil(cfg.MinFreq/df)))
	}
	if cfg.MaxFreq > 0 && cfg.MaxFreq < freq[n-1] {
		maxK = min(n-2, int(math.Floor(cfg.MaxFreq/df)))
	}
	if maxK < minK {
		return nil
	}

	var cands []int
	for k := minK; k <= maxK; k++ {
		if psd[k] > psd[k-1] && psd[k] > psd[k+1] && psdDB[k]-bgDB[k] >= cfg.MinProminenceDB {
			cands = append(cands, k)
		}
	}
	if len(cands) == 0 {
		return nil
	}

	minDist := max(1, int(math.Round(cfg.MinDistanceHz/df)))
	sort.Slice(cands, func(i, j int) bool { return psd[cands[i]] > psd[cands[j]] })
	taken := make([]bool, n)
	var peaks []Peak
	for _, k := range cands {
		if taken[k] {
			continue
		}
		for i := max(0, k-minDist); i <= min(n-1, k+minDist); i++ {
			taken[i] = true
		}
		y1, y2, y3 := psdDB[k-1], psdDB[k], psdDB[k+1]
		delta := 0.0
		if den := y1 - 2*y2 + y3; math.Abs(den) > 1e-12 {
			delta = 0.5 * (y1 - y3) / den
		}
		vertex := y2 - 0.25*(y1-y3)*delta
		p := Peak{
			Freq:    (float64(k) + delta) * df,
			Power:   math.Pow(10, vertex/10),
			PowerdB: vertex,
			PromdB:  vertex - bgDB[k],
			Idx:     k,
		}
		if bw := halfPowerBandwidth(freq, psd, k); bw > 0 {
			p.BandwidthHz = bw
			p.Q = p.Freq / bw
			p.Zeta = 1 / (2 * p.Q)
		}
		peaks = append(peaks, p)
	}
	sort.Slice(peaks, func(i, j int) bool { return peaks[i].Power > peaks[j].Power })
	return peaks
}

func db(p float64) float64 { return 10 * math.Log10(p+1e-300) }

// halfPowerBandwidth is the width between the -3 dB points on both sides
// of the peak at bin k, each one interpolated linearly between the two
// bins around it; 0 when one side does not fall to -3 dB.
func halfPowerBandwidth(freq, psd []float64, k int) float64 {
	if k <= 0 || k >= len(psd)-1 {
		return 0
	}
	th := psd[k] / math.Pow(10, 0.3)
	cross := func(i, j int) float64 { // between bins i and j, psd[i] > th >= psd[j]
		if psd[i] == psd[j] {
			return freq[j]
		}
		return freq[i] + (psd[i]-th)/(psd[i]-psd[j])*(freq[j]-freq[i])
	}
	left := math.NaN()
	for i := k - 1; i >= 0; i-- {
		if psd[i] <= th {
			left = cross(i+1, i)
			break
		}
	}
	right := math.NaN()
	for j := k + 1; j < len(psd); j++ {
		if psd[j] <= th {
			right = cross(j-1, j)
			break
		}
	}
	if math.IsNaN(left) || math.IsNaN(right) {
		return 0
	}
	return right - left
}

func medianSmooth(x []float64, win int) []float64 {
	if win < 3 || win%2 == 0 {
		return append([]float64(nil), x...)
	}
	n := len(x)
	half := win / 2
	out := make([]float64, n)
	buf := make([]float64, 0, win)
	for i := range x {
		buf = buf[:0]
		for j := max(0, i-half); j <= min(n-1, i+half); j++ {
			buf = append(buf, x[j])
		}
		sort.Float64s(buf)
		out[i] = buf[len(buf)/2]
	}
	return out
}
