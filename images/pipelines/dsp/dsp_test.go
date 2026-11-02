package dsp

import (
	"math"
	"strings"
	"testing"
)

func sine(n int, fs, f, amp, offset float64) []float64 {
	x := make([]float64, n)
	for i := range x {
		x[i] = offset + amp*math.Sin(2*math.Pi*f*float64(i)/fs)
	}
	return x
}

func TestConfigReportsAllErrors(t *testing.T) {
	_, err := NewWelchConfig(0, 0, 2, 0, true, 0, 0, 4, 0.1, 9)
	if err == nil {
		t.Fatal("no error")
	}
	for _, want := range []string{"fs", "winLen", "overlap"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("%q missing in %v", want, err)
		}
	}
	// maxFreq 0 means the whole band.
	if _, err := NewWelchConfig(100, 256, 0.5, 0, true, 0, 0, 4, 0.5, 9); err != nil {
		t.Fatalf("maxFreq 0: %v", err)
	}
	if _, err := NewWelchConfig(100, 256, 0.5, 0, true, 0, 60, 4, 0.5, 9); err == nil {
		t.Fatal("maxFreq above Nyquist accepted")
	}
}

// The PSD integrates to the variance of the signal (Parseval), whatever
// the offset: the mean of each window is removed.
func TestWelchScaleAndOffset(t *testing.T) {
	fs := 100.0
	x := sine(20000, fs, 7.3, 2, 9.81) // variance A²/2 = 2
	cfg, _ := DefaultWelchConfig(fs)
	freq, psd, df, err := WelchPSD(x, cfg)
	if err != nil {
		t.Fatal(err)
	}
	area := 0.0
	for _, p := range psd {
		area += p * df
	}
	if math.Abs(area-2) > 0.05 {
		t.Fatalf("PSD area %g, want 2", area)
	}
	_, clean, _, _ := WelchPSD(sine(20000, fs, 7.3, 2, 0), cfg)
	for k := range psd {
		if math.Abs(psd[k]-clean[k]) > 1e-9*(1+clean[k]) {
			t.Fatalf("the offset changes bin %d: %g vs %g", k, psd[k], clean[k])
		}
	}
	if freq[len(freq)-1] != fs/2 {
		t.Fatalf("last frequency %g", freq[len(freq)-1])
	}
}

func TestPeaksAndDamping(t *testing.T) {
	fs := 200.0
	n := 60000
	// Two modes with damping: a sum of decaying responses to random kicks
	// would be closer to reality; two sines plus noise test the frequency.
	x := sine(n, fs, 3.2, 1, 0)
	y := sine(n, fs, 11.7, 0.4, 0)
	seed := uint64(1)
	for i := range x {
		seed = seed*6364136223846793005 + 1442695040888963407
		x[i] += y[i] + 0.05*(float64(seed>>11)/float64(1<<53)-0.5)
	}
	cfg, _ := DefaultWelchConfig(fs)
	cfg.WinLen = 2048
	cfg.MinProminenceDB = 10
	freq, psd, df, err := WelchPSD(x, cfg)
	if err != nil {
		t.Fatal(err)
	}
	peaks := FindPeaks(freq, psd, df, cfg)
	if len(peaks) < 2 {
		t.Fatalf("peaks: %+v", peaks)
	}
	if math.Abs(peaks[0].Freq-3.2) > df/2 || math.Abs(peaks[1].Freq-11.7) > df/2 {
		t.Fatalf("peak frequencies %g, %g (df %g)", peaks[0].Freq, peaks[1].Freq, df)
	}
	if peaks[0].BandwidthHz <= 0 || peaks[0].BandwidthHz > 4*df {
		t.Fatalf("bandwidth %g (df %g)", peaks[0].BandwidthHz, df)
	}
}

func TestSamplingRateIgnoresRepeatedTimes(t *testing.T) {
	times := []float64{0, 0.5, 0.5, 1, 1.5, 2}
	for _, m := range []string{"min", "median", "mean"} {
		fs, err := EstimateSamplingRate(times, m)
		if err != nil || math.IsInf(fs, 0) || math.Abs(fs-2) > 1e-9 {
			t.Errorf("%s: %g %v", m, fs, err)
		}
	}
	if _, err := EstimateSamplingRate([]float64{1, 1}, "median"); err == nil {
		t.Error("no error without intervals")
	}
}

func TestUniformPiecesKeepGapsOut(t *testing.T) {
	var times, values []float64
	for i := 0; i < 100; i++ { // 0..49.5 s
		times = append(times, float64(i)*0.5)
		values = append(values, 1)
	}
	for i := 0; i < 100; i++ { // after a gap of 100 s
		times = append(times, 150+float64(i)*0.5)
		values = append(values, -1)
	}
	pieces := UniformPieces(times, values, 2, 2, 16)
	if len(pieces) != 2 || len(pieces[0]) != 100 || pieces[1][0] != -1 {
		t.Fatalf("pieces: %d %v", len(pieces), len(pieces[0]))
	}
	cfg, _ := DefaultWelchConfig(2)
	if _, _, _, err := WelchPSDSegments(pieces, cfg); err != nil {
		t.Fatal(err)
	}
	if n := Windows(pieces, cfg); n < 4 {
		t.Fatalf("windows: %d", n)
	}
}

func TestDetrendAndInterpolate(t *testing.T) {
	x := []float64{1, 3, 5, 7, 9}
	Detrend(x)
	for _, v := range x {
		if math.Abs(v) > 1e-12 {
			t.Fatalf("detrend: %v", x)
		}
	}
	got, err := InterpolateToUniform([]float64{2, 0, 1}, []float64{4, 0, 2}, InterpolationConfig{TargetFs: 2, ExtrapolMode: "zero"})
	if err != nil || len(got) != 5 || got[1] != 1 || got[4] != 4 {
		t.Fatalf("interpolate: %v %v", got, err)
	}
	if _, err := InterpolateToUniform([]float64{0, 1}, []float64{0, 1}, InterpolationConfig{TargetFs: -1, ExtrapolMode: "bad"}); err == nil ||
		!strings.Contains(err.Error(), "targetFs") || !strings.Contains(err.Error(), "extrapolMode") {
		t.Fatalf("all errors reported: %v", err)
	}
}
