package dsp

import (
	"math"
	"math/rand"
	"testing"
)

func near(a, b, tol float64) bool { return math.Abs(a-b) <= tol }

// ASTM E1049-85 Fig. 6 / Table 4: -2 1 -3 5 -1 3 -4 4 -2
func TestRainflowASTM(t *testing.T) {
	cycles := Rainflow([]float64{-2, 1, -3, 5, -1, 3, -4, 4, -2}, 0)
	counts := map[float64]float64{}
	for _, c := range cycles {
		counts[c.Range] += c.Count
	}
	want := map[float64]float64{3: 0.5, 4: 1.5, 6: 0.5, 8: 1.0, 9: 0.5}
	if len(counts) != len(want) {
		t.Fatal(counts)
	}
	for r, n := range want {
		if counts[r] != n {
			t.Fatalf("range %v: %v cycles, want %v (%v)", r, counts[r], n, counts)
		}
	}
}

// The incremental counter, fed in pieces (as messages), counts the same.
func TestRainflowIncremental(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	x := make([]float64, 2000)
	for i := range x {
		x[i] = 50*math.Sin(float64(i)/7) + 20*rng.NormFloat64()
	}
	whole := Rainflow(x, 5)
	c := &RainflowCounter{Gate: 5}
	var closed []Cycle
	for i := 0; i < len(x); i += 37 {
		end := min(i+37, len(x))
		closed = append(closed, c.Push(x[i:end]...)...)
	}
	total := func(cs []Cycle) (n, sum float64) {
		for _, cy := range cs {
			n += cy.Count
			sum += cy.Count * cy.Range
		}
		return
	}
	// closing the stream as a record: the last extreme and the residue
	if c.Dir != 0 {
		closed = c.reversal(c.Cand, closed)
		c.Dir = 0
	}
	closed = append(closed, c.ResidueCycles()...)
	n1, s1 := total(whole)
	n2, s2 := total(closed)
	if n1 != n2 || !near(s1, s2, 1e-6) {
		t.Fatal(n1, n2, s1, s2)
	}
	// the gate filters the small reversals
	if len(Rainflow([]float64{0, 1, 0.5, 1.2, 0, 10, 0}, 1)) >= len(Rainflow([]float64{0, 1, 0.5, 1.2, 0, 10, 0}, 0)) {
		t.Fatal("gate")
	}
}

func TestSNCurves(t *testing.T) {
	d, err := DNVCurve("D", "air")
	if err != nil {
		t.Fatal(err)
	}
	// N = 1e7 at the fatigue limit 52.63 MPa (both lines)
	if n := d.CyclesToFailure(52.63); !near(math.Log10(n), 7, 0.002) {
		t.Fatal(math.Log10(n))
	}
	// above the knee: line 1 (m = 3); below: line 2 (m = 5)
	if n := d.CyclesToFailure(100); !near(math.Log10(n), 12.164-3*2, 1e-9) {
		t.Fatal(n)
	}
	if n := d.CyclesToFailure(30); !near(math.Log10(n), 15.606-5*math.Log10(30), 1e-9) {
		t.Fatal(n)
	}
	cp, _ := DNVCurve("D", "seawater_cp")
	if cp.Lines[0].LogA != 11.764 {
		t.Fatal(cp.Lines[0])
	}
	// the seawater knee is at 1e6 cycles
	sKnee := math.Pow(10, (11.764-6)/3)
	if n := cp.CyclesToFailure(sKnee); !near(math.Log10(n), 6, 0.002) {
		t.Fatal(math.Log10(n))
	}
	b1, _ := DNVCurve("b1", "seawater_cp")
	if b1.Lines[0].LogA != 14.917 || b1.Lines[0].M != 4 {
		t.Fatal(b1)
	}
	// Miner with DFF, SCF and thickness
	c := SNCurve{Lines: []SNLine{{M: 3, LogA: 12}}, DFF: 2}
	if dmg := c.Damage([]Cycle{{Range: 100, Count: 1000}}); !near(dmg, 2*1000/1e6, 1e-12) {
		t.Fatal(dmg)
	}
	c = SNCurve{Lines: []SNLine{{M: 3, LogA: 12}}, SCF: 2, T: 50, K: 0.25}
	if r := c.EffectiveRange(10); !near(r, 20*math.Pow(2, 0.25), 1e-12) {
		t.Fatal(r)
	}
	c = SNCurve{Lines: []SNLine{{M: 3, LogA: 12}}, Cutoff: 20}
	if !math.IsInf(c.CyclesToFailure(19), 1) {
		t.Fatal("cutoff")
	}
	if _, err := DNVCurve("Z", "air"); err == nil {
		t.Fatal("unknown category")
	}
	if (SNCurve{}).Validate() == nil {
		t.Fatal("empty curve accepted")
	}
	h := RangeHistogram([]Cycle{{Range: 5, Count: 1}, {Range: 12, Count: 0.5}, {Range: 14, Count: 1}}, 10)
	if len(h) != 2 || h[1].Count != 1.5 || h[1].From != 10 {
		t.Fatal(h)
	}
}

func TestVibrationFeatures(t *testing.T) {
	fs := 1000.0
	x := make([]float64, 4096)
	for i := range x {
		x[i] = 2 * math.Sin(2*math.Pi*50*float64(i)/fs)
	}
	f, err := ComputeVibrationFeatures(x, VibrationOptions{Fs: fs, Bands: []Band{{"b50", 40, 60}, {"b200", 190, 210}},
		VelocityFrom: 10, VelocityTo: 400, AccelToMS2: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !near(f.RMS, 2/math.Sqrt2, 1e-3) || !near(f.CrestFactor, math.Sqrt2, 1e-3) || !near(f.Kurtosis, 1.5, 1e-2) {
		t.Fatal(f.RMS, f.CrestFactor, f.Kurtosis)
	}
	if f.Dominant == nil || !near(f.Dominant.Freq, 50, 0.5) {
		t.Fatal(f.Dominant)
	}
	// the band around 50 Hz holds the energy (Hann leakage aside)
	if !near(f.Bands["b50"], f.RMS, 0.02*f.RMS) || f.Bands["b200"] > 0.01 {
		t.Fatal(f.Bands)
	}
	// velocity of a 50 Hz sine: a_rms / (2π50), in mm/s
	want := 1000 * f.RMS / (2 * math.Pi * 50)
	if f.VelocityRMS == nil || !near(*f.VelocityRMS, want, 0.03*want) {
		t.Fatal(*f.VelocityRMS, want)
	}
	rng := rand.New(rand.NewSource(2))
	for i := range x {
		x[i] = rng.NormFloat64()
	}
	g, _ := ComputeVibrationFeatures(x, VibrationOptions{Fs: fs})
	if !near(g.Kurtosis, 3, 0.25) || !near(g.Skewness, 0, 0.15) {
		t.Fatal(g.Kurtosis, g.Skewness)
	}
	if _, err := ComputeVibrationFeatures(x[:10], VibrationOptions{Fs: fs}); err == nil {
		t.Fatal("short block")
	}
	if autoSegment(4096) != 2048 || autoSegment(300) != 256 || autoSegment(20) != 16 {
		t.Fatal(autoSegment(4096), autoSegment(300), autoSegment(20))
	}
}

func TestStats(t *testing.T) {
	m := ComputeMoments([]float64{1, 2, 3, 4})
	if m.Mean != 2.5 || !near(m.Std, math.Sqrt(5.0/3), 1e-12) || m.Min != 1 || m.Max != 4 || m.Skewness != 0 {
		t.Fatal(m)
	}
	s := SortedCopy([]float64{4, 1, 3, 2})
	if Percentile(s, 50) != 2.5 || Percentile(s, 0) != 1 || Percentile(s, 100) != 4 || !near(Percentile(s, 90), 3.7, 1e-12) {
		t.Fatal(Percentile(s, 90))
	}
	if !math.IsNaN(Percentile(nil, 50)) {
		t.Fatal("empty")
	}
}

func TestAnomaly(t *testing.T) {
	rng := rand.New(rand.NewSource(3))
	series := func(n int, f func(i int) float64) []float64 {
		x := make([]float64, n)
		for i := range x {
			x[i] = f(i)
		}
		return x
	}
	// a spike in noise: zscore and iqr find it, the baseline is not polluted
	x := series(300, func(i int) float64 { return 10 + rng.NormFloat64() })
	x[200] = 25
	for _, method := range []string{"zscore", "iqr"} {
		res, err := DetectAnomalies(x, AnomalyConfig{Method: method, Window: 100})
		if err != nil {
			t.Fatal(err)
		}
		if !res[200].IsAnomaly || res[150].Score == nil {
			t.Fatal(method, res[200])
		}
		flagged := 0
		for _, r := range res {
			if r.IsAnomaly {
				flagged++
			}
		}
		if flagged > 8 {
			t.Fatal(method, "too many false alarms", flagged)
		}
		if res[0].Ready || !res[30].Ready {
			t.Fatal(method, "warm-up")
		}
	}
	// a small persistent shift (0.8 σ): EWMA finds it, a 3σ zscore barely
	y := series(400, func(i int) float64 {
		v := 10 + rng.NormFloat64()
		if i >= 200 {
			v += 0.8
		}
		return v
	})
	ew, _ := DetectAnomalies(y, AnomalyConfig{Method: "ewma", Lambda: 0.1, Threshold: 3})
	first := -1
	for i, r := range ew {
		if r.IsAnomaly && first < 0 {
			first = i
		}
	}
	if first < 200 || first > 260 {
		t.Fatal("ewma detection at", first)
	}
	// a stuck sensor that jumps: constant baseline
	z := series(50, func(i int) float64 { return 5 })
	z[40] = 6
	res, _ := DetectAnomalies(z, AnomalyConfig{Method: "zscore", Window: 20})
	if !res[40].IsAnomaly || res[40].Reason == "" || res[40].Score != nil {
		t.Fatal(res[40])
	}
	for _, bad := range []AnomalyConfig{{Method: "x"}, {Method: "zscore", Window: 2}, {Method: "ewma", Lambda: 2}, {Method: "iqr", Window: 10, Warmup: 20}} {
		if bad.WithDefaults().Validate() == nil {
			t.Fatal("accepted", bad)
		}
	}
}
