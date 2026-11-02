package function_library

import (
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
