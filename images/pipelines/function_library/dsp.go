package function_library

import (
	"errors"
	"strconv"

	"pipelines/common"
	sigdsp "pipelines/dsp"
	"pipelines/logger"
)

// Dsp is go.dsp of the Function nodes' scripts. The algorithms are in the
// package pipelines/dsp, shared with the AI agents' spectrum charts; this
// adapter keeps the scripts' API and reports the errors to the node (log
// and HandleError), returning empty values as before.
type Dsp struct {
	node common.Node
	log  *logger.Logger
}

func NewDsp(node common.Node, log *logger.Logger) *Dsp {
	return &Dsp{node: node, log: log}
}

type WelchConfig = sigdsp.WelchConfig
type Peak = sigdsp.Peak
type InterpolationConfig = sigdsp.InterpolationConfig

func (d *Dsp) fail(err error) {
	d.log.Errorf("%v", err)
	d.node.HandleError(err)
}

// GetWelchConfig creates a WelchConfig with the specified parameters
// (maxFreq 0: up to the Nyquist frequency). An invalid one reports all its
// problems and returns an empty configuration.
func (d *Dsp) GetWelchConfig(fs float64, winLen int, overlap float64, nfft int, zeroPadToNFFT bool, minFreq float64, maxFreq float64, minProminenceDB float64, minDistanceHz float64, smoothBins int) WelchConfig {
	cfg, err := sigdsp.NewWelchConfig(fs, winLen, overlap, nfft, zeroPadToNFFT, minFreq, maxFreq, minProminenceDB, minDistanceHz, smoothBins)
	if err != nil {
		d.fail(err)
		return WelchConfig{}
	}
	return cfg
}

// GetDefaultWelchConfig creates a WelchConfig with default parameters for
// the sampling rate fs (windows of 2 s, 50 % overlap).
func (d *Dsp) GetDefaultWelchConfig(fs float64) WelchConfig {
	cfg, err := sigdsp.DefaultWelchConfig(fs)
	if err != nil {
		d.fail(err)
		return WelchConfig{}
	}
	return cfg
}

// GetInterpolationConfig creates an InterpolationConfig with the specified
// parameters.
func (d *Dsp) GetInterpolationConfig(targetFs float64, startTime float64, endTime float64, extrapolMode string) InterpolationConfig {
	cfg := InterpolationConfig{TargetFs: targetFs, StartTime: startTime, EndTime: endTime, ExtrapolMode: extrapolMode}
	if err := cfg.Validate(); err != nil {
		d.fail(err)
		return InterpolationConfig{}
	}
	return cfg
}

// DetrendInPlace removes the linear trend of x and returns the result. A
// script gets a copy of its array, so it must use the returned value:
// x = dsp.DetrendInPlace(x).
func (d *Dsp) DetrendInPlace(x []float64) []float64 {
	return sigdsp.Detrend(x)
}

// WelchPSD computes the PSD (unit^2/Hz) with Welch's method, removing the
// mean of each window. Returns frequencies (0..Nyquist), PSD and df.
func (d *Dsp) WelchPSD(x []float64, cfg WelchConfig) (freq, psd []float64, df float64) {
	freq, psd, df, err := sigdsp.WelchPSD(x, cfg)
	if err != nil {
		d.log.Errorf("WelchPSD: %v", err)
		return nil, nil, 0
	}
	return freq, psd, df
}

// FindWelchPeaks detects the peaks of a PSD (prominence, minimum distance,
// -3 dB bandwidth, Q and damping ratio), highest first.
func (d *Dsp) FindWelchPeaks(freq, psd []float64, df float64, cfg WelchConfig) []Peak {
	return sigdsp.FindPeaks(freq, psd, df, cfg)
}

// SortTimeSeriesData sorts the samples by time, keeping times and values
// together.
func (d *Dsp) SortTimeSeriesData(times, values []float64) ([]float64, []float64) {
	return sigdsp.SortSeries(times, values)
}

// EstimateUniformSamplingRate estimates the sampling rate from the times:
// "min", "median" or "mean" of the intervals (repeated times left out).
// 1.0 when it cannot.
func (d *Dsp) EstimateUniformSamplingRate(times []float64, method string) float64 {
	fs, err := sigdsp.EstimateSamplingRate(times, method)
	if err != nil {
		if len(times) < 2 {
			return 1.0
		}
		d.fail(err)
		return 1.0
	}
	return fs
}

// InterpolateToUniform interpolates the series to a uniform grid (gaps
// included: see SplitToUniform).
func (d *Dsp) InterpolateToUniform(times, values []float64, config InterpolationConfig) []float64 {
	out, err := sigdsp.InterpolateToUniform(times, values, config)
	if err != nil {
		d.fail(err)
		return nil
	}
	return out
}

// SplitToUniform splits the sorted series where two samples are more than
// maxGap seconds apart and resamples each piece of at least minLen samples
// at fs: for spectra of data with interruptions (see WelchPSDPieces).
func (d *Dsp) SplitToUniform(times, values []float64, fs, maxGap float64, minLen int) [][]float64 {
	return sigdsp.UniformPieces(times, values, fs, maxGap, minLen)
}

// WelchPSDPieces is WelchPSD over the pieces of a signal (SplitToUniform):
// the windows of all of them are averaged.
func (d *Dsp) WelchPSDPieces(pieces [][]float64, cfg WelchConfig) (freq, psd []float64, df float64) {
	freq, psd, df, err := sigdsp.WelchPSDSegments(pieces, cfg)
	if err != nil {
		d.log.Errorf("WelchPSDPieces: %v", err)
		return nil, nil, 0
	}
	return freq, psd, df
}

// ---- statistics ----

type Moments = sigdsp.Moments

// Moments: n, mean, std (n-1), rms, min, max, skewness and kurtosis (3 for
// a normal distribution).
func (d *Dsp) Moments(x []float64) Moments {
	return sigdsp.ComputeMoments(x)
}

// Percentile of x (p in 0..100, linear interpolation; x is not modified).
func (d *Dsp) Percentile(x []float64, p float64) float64 {
	return sigdsp.Percentile(sigdsp.SortedCopy(x), p)
}

// ---- rainflow and fatigue ----

type Cycle = sigdsp.Cycle
type SNCurve = sigdsp.SNCurve
type HistogramBin = sigdsp.HistogramBin

// Rainflow counts the cycles of a record (ASTM E1049; the residue as half
// cycles). gate: reversals smaller than it are ignored (0: none).
func (d *Dsp) Rainflow(x []float64, gate float64) []Cycle {
	return sigdsp.Rainflow(x, gate)
}

// GetDNVCurve is a DNV-RP-C203 S-N curve: category B1, B2, C, C1, C2, D, E,
// F, F1, F3, G, W1, W2 or W3; environment "air" or "seawater_cp".
func (d *Dsp) GetDNVCurve(category, environment string) SNCurve {
	c, err := sigdsp.DNVCurve(category, environment)
	if err != nil {
		d.fail(err)
		return SNCurve{}
	}
	return c
}

// GetSNCurve is a custom S-N curve: lines given as [m1, logA1, m2, logA2, ...]
// (log10 N = logA - m log10 S; the curve takes the largest N of its lines)
// and a cutoff (ranges below it do no damage; 0: none).
func (d *Dsp) GetSNCurve(lines []float64, cutoff float64) SNCurve {
	c := SNCurve{Name: "custom", Cutoff: cutoff}
	if len(lines)%2 != 0 {
		d.fail(errors.New("the S-N lines are pairs: [m1, logA1, m2, logA2, ...]"))
		return SNCurve{}
	}
	for i := 0; i+1 < len(lines); i += 2 {
		c.Lines = append(c.Lines, sigdsp.SNLine{M: lines[i], LogA: lines[i+1]})
	}
	if err := c.Validate(); err != nil {
		d.fail(err)
		return SNCurve{}
	}
	return c
}

// WithSNCorrections returns the curve with a stress concentration factor,
// a thickness correction ((t/tRef)^k for t > tRef; tRef 0: 25 mm; k 0:
// the curve's) and a design fatigue factor (0: 1).
func (d *Dsp) WithSNCorrections(curve SNCurve, scf, t, tRef, k, dff float64) SNCurve {
	curve.SCF, curve.T, curve.TRef, curve.DFF = scf, t, tRef, dff
	if k > 0 {
		curve.K = k
	}
	if err := curve.Validate(); err != nil {
		d.fail(err)
	}
	return curve
}

// MinerDamage is the Palmgren-Miner damage of the cycles with the curve.
func (d *Dsp) MinerDamage(cycles []Cycle, curve SNCurve) float64 {
	return curve.Damage(cycles)
}

// CyclesToFailure of a stress range with the curve (+Inf below the cutoff).
func (d *Dsp) CyclesToFailure(stressRange float64, curve SNCurve) float64 {
	return curve.CyclesToFailure(stressRange)
}

// RangeHistogram counts the cycles in bins of the given width.
func (d *Dsp) RangeHistogram(cycles []Cycle, width float64) []HistogramBin {
	return sigdsp.RangeHistogram(cycles, width)
}

// ---- vibration ----

type VibrationFeatures = sigdsp.VibrationFeatures

// VibrationFeatures of a block sampled at fs: rms, peak, crest factor,
// kurtosis..., the dominant frequency and the main peaks.
func (d *Dsp) VibrationFeatures(x []float64, fs float64) *VibrationFeatures {
	f, err := sigdsp.ComputeVibrationFeatures(x, sigdsp.VibrationOptions{Fs: fs})
	if err != nil {
		d.fail(err)
		return nil
	}
	return &f
}

// VibrationFeaturesWithOptions: as VibrationFeatures, with the Welch window
// (0: automatic), bands given as [from1, to1, from2, to2, ...] Hz (named
// "from-to") and the velocity RMS (mm/s) of an acceleration over
// [velFrom, velTo] Hz (accelToMS2: 1 for m/s², 9.80665 for g; 0, 0: none).
func (d *Dsp) VibrationFeaturesWithOptions(x []float64, fs float64, segmentLength int, bands []float64, velFrom, velTo, accelToMS2 float64) *VibrationFeatures {
	o := sigdsp.VibrationOptions{Fs: fs, SegmentLength: segmentLength, VelocityFrom: velFrom, VelocityTo: velTo, AccelToMS2: accelToMS2}
	for i := 0; i+1 < len(bands); i += 2 {
		o.Bands = append(o.Bands, sigdsp.Band{Name: fmtBand(bands[i], bands[i+1]), From: bands[i], To: bands[i+1]})
	}
	f, err := sigdsp.ComputeVibrationFeatures(x, o)
	if err != nil {
		d.fail(err)
		return nil
	}
	return &f
}

// ---- anomalies ----

type AnomalyResult = sigdsp.AnomalyResult

// DetectAnomalies judges every sample of a series: method "zscore", "ewma"
// or "iqr"; window (zscore, iqr); threshold (|z| or L, 3; IQR k, 1.5);
// lambda (ewma, 0.2); warmup (samples before judging). 0: the default.
func (d *Dsp) DetectAnomalies(x []float64, method string, window int, threshold, lambda float64, warmup int) []AnomalyResult {
	res, err := sigdsp.DetectAnomalies(x, sigdsp.AnomalyConfig{Method: method, Window: window, Threshold: threshold, Lambda: lambda, Warmup: warmup})
	if err != nil {
		d.fail(err)
		return nil
	}
	return res
}

// ---- trends and remaining useful life ----

type LinearFit = sigdsp.LinearFit
type RULEstimate = sigdsp.RULEstimate

// FitLinear fits a least-squares line y = intercept + slope·x (slope with
// its standard error, R²).
func (d *Dsp) FitLinear(x, y []float64) *LinearFit {
	fit, err := sigdsp.FitLinear(x, y)
	if err != nil {
		d.fail(err)
		return nil
	}
	return &fit
}

// EstimateRUL fits model "linear" or "exponential" to (x, y) and gives the
// time from xNow until it reaches the threshold (rising: the indicator
// grows towards it), with a band from the slope's uncertainty (about 95 %).
// The RUL is in the units of x.
func (d *Dsp) EstimateRUL(x, y []float64, model string, threshold float64, rising bool, xNow float64) *RULEstimate {
	est, err := sigdsp.EstimateRUL(x, y, model, threshold, rising, xNow)
	if err != nil {
		d.fail(err)
		return nil
	}
	return &est
}

func fmtBand(from, to float64) string {
	return strconv.FormatFloat(from, 'g', -1, 64) + "-" + strconv.FormatFloat(to, 'g', -1, 64)
}
