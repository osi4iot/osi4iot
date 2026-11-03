package dsp

// Trends of a health indicator and the remaining useful life (RUL) they
// give: the time until the trend reaches a failure threshold. Used by the
// Degradation node and by the scripts (go.dsp).
//
// Two models: linear (y = a + b·x) and exponential (y = a·e^(b·x), fitted as
// a line on ln y; every value and the threshold must be > 0). x is the time
// in any unit (the node uses days); the RUL comes in that unit.
//
// The band of the RUL comes from the uncertainty of the slope: the lines
// through the centre of the data with slope b ± z·SE(b) (z = 1.96: about
// 95 %). A slope that may be flat or improving gives an open band (no
// upper bound).

import (
	"errors"
	"math"
)

// LinearFit is a least-squares line y = Intercept + Slope·x.
type LinearFit struct {
	N          int     `json:"n"`
	Intercept  float64 `json:"intercept"`
	Slope      float64 `json:"slope"`
	SlopeSE    float64 `json:"slopeSE"`    // standard error of the slope
	ResidualSD float64 `json:"residualSD"` // standard deviation of the residuals (n-2)
	R2         float64 `json:"r2"`
	XMean      float64 `json:"xMean"`
	YMean      float64 `json:"yMean"`
}

// FitLinear fits a line by least squares (at least 3 points, with
// different x).
func FitLinear(x, y []float64) (LinearFit, error) {
	n := len(x)
	if n != len(y) {
		return LinearFit{}, errors.New("x and y must have the same length")
	}
	if n < 3 {
		return LinearFit{}, errors.New("at least 3 points are needed")
	}
	var sx, sy float64
	for i := range x {
		sx += x[i]
		sy += y[i]
	}
	mx, my := sx/float64(n), sy/float64(n)
	var sxx, sxy, syy float64
	for i := range x {
		dx, dy := x[i]-mx, y[i]-my
		sxx += dx * dx
		sxy += dx * dy
		syy += dy * dy
	}
	if sxx == 0 {
		return LinearFit{}, errors.New("all the points have the same x")
	}
	b := sxy / sxx
	a := my - b*mx
	var sse float64
	for i := range x {
		r := y[i] - (a + b*x[i])
		sse += r * r
	}
	fit := LinearFit{N: n, Intercept: a, Slope: b, XMean: mx, YMean: my}
	fit.ResidualSD = math.Sqrt(sse / float64(n-2))
	fit.SlopeSE = fit.ResidualSD / math.Sqrt(sxx)
	if syy > 0 {
		fit.R2 = 1 - sse/syy
	} else {
		fit.R2 = 1
	}
	return fit, nil
}

// At is the line's value at x.
func (f LinearFit) At(x float64) float64 { return f.Intercept + f.Slope*x }

// RULEstimate is what a trend says about a threshold.
type RULEstimate struct {
	Model     string    `json:"model"`
	Fit       LinearFit `json:"fit"`     // on y (linear) or on ln y (exponential)
	Current   float64   `json:"current"` // the trend's value at xNow
	Rate      float64   `json:"rate"`    // linear: slope (per x unit); exponential: relative growth per x unit (e^b - 1)
	Status    string    `json:"status"`  // "degrading", "stable" or "exceeded"
	RUL       float64   `json:"rul"`     // NaN when not degrading
	RULLow    float64   `json:"rulLow"`  // NaN when not degrading
	RULHigh   float64   `json:"rulHigh"` // +Inf when the slope may be flat
	Rising    bool      `json:"rising"`
	Threshold float64   `json:"threshold"`
}

const rulBandZ = 1.96

// EstimateRUL fits the model to (x, y) and gives the time from xNow until
// the trend reaches the threshold: rising says whether the indicator grows
// towards it (vibration, temperature) or falls (efficiency, thickness).
func EstimateRUL(x, y []float64, model string, threshold float64, rising bool, xNow float64) (RULEstimate, error) {
	est := RULEstimate{Model: model, Rising: rising, Threshold: threshold, RUL: math.NaN(), RULLow: math.NaN(), RULHigh: math.NaN()}
	yy := y
	target := threshold
	switch model {
	case "linear":
	case "exponential":
		if threshold <= 0 {
			return est, errors.New("the exponential model needs a threshold > 0")
		}
		yy = make([]float64, len(y))
		for i, v := range y {
			if v <= 0 {
				return est, errors.New("the exponential model needs values > 0")
			}
			yy[i] = math.Log(v)
		}
		target = math.Log(threshold)
	default:
		return est, errors.New("the model must be linear or exponential")
	}
	fit, err := FitLinear(x, yy)
	if err != nil {
		return est, err
	}
	est.Fit = fit
	now := fit.At(xNow)
	if model == "exponential" {
		est.Current = math.Exp(now)
		est.Rate = math.Exp(fit.Slope) - 1
	} else {
		est.Current = now
		est.Rate = fit.Slope
	}
	sign := 1.0
	if !rising {
		sign = -1
	}
	if sign*(now-target) >= 0 {
		est.Status, est.RUL, est.RULLow, est.RULHigh = "exceeded", 0, 0, 0
		return est, nil
	}
	// time to the target of the line through the centre with slope b
	timeTo := func(b float64) float64 {
		if sign*b <= 0 {
			return math.Inf(1)
		}
		cross := fit.XMean + (target-fit.YMean)/b
		return math.Max(0, cross-xNow)
	}
	if sign*fit.Slope <= 0 {
		est.Status = "stable"
		return est, nil
	}
	est.Status = "degrading"
	est.RUL = timeTo(fit.Slope)
	fast := fit.Slope + sign*rulBandZ*fit.SlopeSE
	slow := fit.Slope - sign*rulBandZ*fit.SlopeSE
	est.RULLow = timeTo(fast)
	est.RULHigh = timeTo(slow)
	return est, nil
}
