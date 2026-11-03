package dsp

import (
	"math"
	"testing"
)

func TestFitLinearAndRUL(t *testing.T) {
	x := []float64{0, 1, 2, 3, 4, 5}
	y := []float64{1, 3, 5, 7, 9, 11}
	fit, err := FitLinear(x, y)
	if err != nil || math.Abs(fit.Slope-2) > 1e-12 || math.Abs(fit.Intercept-1) > 1e-12 || fit.R2 != 1 || fit.SlopeSE != 0 {
		t.Fatal(fit, err)
	}
	// rising to 21 from x = 5 (y = 11): 5 units
	est, err := EstimateRUL(x, y, "linear", 21, true, 5)
	if err != nil || est.Status != "degrading" || math.Abs(est.RUL-5) > 1e-9 {
		t.Fatal(est, err)
	}
	// noisy: the band contains the estimate
	noisy := []float64{1.2, 2.7, 5.3, 6.8, 9.4, 10.6}
	est, _ = EstimateRUL(x, noisy, "linear", 21, true, 5)
	if !(est.RULLow < est.RUL && est.RUL < est.RULHigh) {
		t.Fatal(est)
	}
	// already past the threshold, and improving (away from it)
	if est, _ := EstimateRUL(x, y, "linear", 5, true, 5); est.Status != "exceeded" {
		t.Fatal(est.Status)
	}
	if est, _ := EstimateRUL(x, []float64{5, 4, 3, 2, 1, 0.5}, "linear", 10, true, 5); est.Status != "stable" || !math.IsNaN(est.RUL) {
		t.Fatal(est)
	}
	// exponential: 2·e^(0.1x) reaches 2e at x = 10
	ey := make([]float64, len(x))
	for i, v := range x {
		ey[i] = 2 * math.Exp(0.1*v)
	}
	est, err = EstimateRUL(x, ey, "exponential", 2*math.E, true, 5)
	if err != nil || math.Abs(est.RUL-5) > 1e-9 || math.Abs(est.Rate-(math.Exp(0.1)-1)) > 1e-12 {
		t.Fatal(est, err)
	}
	for _, bad := range []func() error{
		func() error { _, err := FitLinear([]float64{1, 2}, []float64{1, 2}); return err },
		func() error { _, err := FitLinear([]float64{1, 1, 1}, []float64{1, 2, 3}); return err },
		func() error { _, err := EstimateRUL(x, y, "poly", 1, true, 0); return err },
		func() error {
			_, err := EstimateRUL(x, []float64{1, 0, 1, 1, 1, 1}, "exponential", 2, true, 0)
			return err
		},
	} {
		if bad() == nil {
			t.Fatal("accepted")
		}
	}
}
