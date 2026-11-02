// Package dsp is the platform's digital signal processing: Welch power
// spectral density, peak detection with half-power bandwidth and damping,
// detrending, sampling-rate estimation and resampling to a uniform grid.
//
// It is plain computation: no node, logger or platform type. The Function
// nodes reach it through function_library's Dsp (go.dsp in the scripts),
// which reports the errors to the node; the AI agents' spectrum charts
// (package agentdata) use it directly.
package dsp

import (
	"errors"
	"fmt"
	"math"

	"gonum.org/v1/gonum/dsp/fourier"
)

// WelchConfig configures WelchPSD and FindPeaks.
type WelchConfig struct {
	Fs               float64 // sampling rate (Hz)
	WinLen           int     // samples per window (e.g. ≈ Fs * window duration)
	Overlap          float64 // 0.0..0.95 (fraction of the window)
	NFFT             int     // >= WinLen; 0: the smallest 2^k >= WinLen
	ZeroPadToNFFT    bool    // true: FFT of NFFT points (recommended); false: of WinLen
	MinFreq, MaxFreq float64 // band of interest for the peaks (Hz); 0: no limit
	MinProminenceDB  float64 // e.g. 6..12 dB
	MinDistanceHz    float64 // minimum separation between peaks (Hz)
	SmoothBins       int     // median smoothing of the background (odd bins), e.g. 9..21
}

// Peak is a peak of a PSD.
type Peak struct {
	Freq        float64 `json:"freq_hz"`       // Hz (interpolated)
	Power       float64 `json:"psd"`           // PSD (unit^2/Hz)
	PowerdB     float64 `json:"psd_db"`        // 10*log10(PSD)
	PromdB      float64 `json:"prominence_db"` // over the local background
	BandwidthHz float64 `json:"bandwidth_hz"`  // -3 dB bandwidth (0 when not found on both sides)
	Q           float64 `json:"q"`             // f0 / bandwidth
	Zeta        float64 `json:"zeta"`          // damping ratio ≈ 1/(2Q)
	Idx         int     `json:"bin"`           // bin of the peak
}

// NewWelchConfig checks the parameters and returns the configuration. All
// the problems found are reported together.
func NewWelchConfig(fs float64, winLen int, overlap float64, nfft int, zeroPadToNFFT bool,
	minFreq, maxFreq, minProminenceDB, minDistanceHz float64, smoothBins int) (WelchConfig, error) {
	cfg := WelchConfig{
		Fs: fs, WinLen: winLen, Overlap: overlap, NFFT: nfft, ZeroPadToNFFT: zeroPadToNFFT,
		MinFreq: minFreq, MaxFreq: maxFreq, MinProminenceDB: minProminenceDB,
		MinDistanceHz: minDistanceHz, SmoothBins: smoothBins,
	}
	if err := cfg.Validate(); err != nil {
		return WelchConfig{}, err
	}
	return cfg, nil
}

// Validate reports every invalid parameter of the configuration.
func (cfg WelchConfig) Validate() error {
	var errs []error
	if !(cfg.Fs > 0) {
		errs = append(errs, fmt.Errorf("invalid fs %g: must be positive", cfg.Fs))
	}
	if cfg.WinLen <= 0 {
		errs = append(errs, fmt.Errorf("invalid winLen %d: must be positive", cfg.WinLen))
	}
	if cfg.Overlap < 0 || cfg.Overlap > 0.95 {
		errs = append(errs, fmt.Errorf("invalid overlap %g: must be in [0, 0.95]", cfg.Overlap))
	}
	if cfg.NFFT < 0 || (cfg.NFFT > 0 && cfg.NFFT < cfg.WinLen) {
		errs = append(errs, fmt.Errorf("invalid nfft %d: must be 0 or >= winLen %d", cfg.NFFT, cfg.WinLen))
	}
	if cfg.MinFreq < 0 {
		errs = append(errs, fmt.Errorf("invalid minFreq %g: must not be negative", cfg.MinFreq))
	}
	if cfg.MaxFreq < 0 {
		errs = append(errs, fmt.Errorf("invalid maxFreq %g: must not be negative (0: up to Nyquist)", cfg.MaxFreq))
	}
	if cfg.MaxFreq > 0 && cfg.MinFreq >= cfg.MaxFreq {
		errs = append(errs, fmt.Errorf("invalid band: minFreq %g must be below maxFreq %g", cfg.MinFreq, cfg.MaxFreq))
	}
	if cfg.Fs > 0 && cfg.MaxFreq > cfg.Fs/2 {
		errs = append(errs, fmt.Errorf("invalid maxFreq %g: must not exceed the Nyquist frequency %g", cfg.MaxFreq, cfg.Fs/2))
	}
	if cfg.MinDistanceHz < 0 {
		errs = append(errs, fmt.Errorf("invalid minDistanceHz %g: must not be negative", cfg.MinDistanceHz))
	}
	return errors.Join(errs...)
}

// DefaultWelchConfig is a configuration for a sampling rate: windows of
// 2 s with 50 % overlap, the whole band, peaks of 4 dB at least 3 bins
// apart.
func DefaultWelchConfig(fs float64) (WelchConfig, error) {
	if !(fs > 0) {
		return WelchConfig{}, fmt.Errorf("invalid fs %g: must be positive", fs)
	}
	winLen := int(2 * fs)
	if winLen < 8 {
		winLen = 8
	}
	deltaF := fs / float64(nextPow2(winLen))
	minDistance := 3 * deltaF
	if minDistance < 0.05 {
		minDistance = 0.05
	}
	return WelchConfig{
		Fs: fs, WinLen: winLen, Overlap: 0.5, ZeroPadToNFFT: true,
		MinProminenceDB: 4, MinDistanceHz: minDistance, SmoothBins: 9,
	}, nil
}

// nfft is the FFT length of the configuration.
func (cfg WelchConfig) nfft() int {
	if !cfg.ZeroPadToNFFT {
		return cfg.WinLen
	}
	if cfg.NFFT > 0 {
		return cfg.NFFT
	}
	return nextPow2(cfg.WinLen)
}

// WelchPSD is the one-sided power spectral density of x (unit^2/Hz), with
// SciPy's conventions (scipy.signal.welch with a Hann window and
// detrend='constant'): the mean of each window is removed, Pxx =
// 2/(fs*sum(w^2)) |X[k]|^2 (DC and Nyquist not doubled), averaged over the
// windows. Returns the frequencies (0..Nyquist), the PSD and the bin width.
func WelchPSD(x []float64, cfg WelchConfig) (freq, psd []float64, df float64, err error) {
	return WelchPSDSegments([][]float64{x}, cfg)
}

// WelchPSDSegments is WelchPSD over several pieces of a signal (the parts
// between gaps in the data): the windows of every piece are averaged
// together. Pieces shorter than a window are skipped.
func WelchPSDSegments(pieces [][]float64, cfg WelchConfig) (freq, psd []float64, df float64, err error) {
	if err := cfg.Validate(); err != nil {
		return nil, nil, 0, err
	}
	overlap := int(math.Round(cfg.Overlap * float64(cfg.WinLen)))
	if overlap >= cfg.WinLen {
		return nil, nil, 0, fmt.Errorf("overlap %g leaves no step between windows of %d samples", cfg.Overlap, cfg.WinLen)
	}
	step := cfg.WinLen - overlap
	nfft := cfg.nfft()

	w := hann(cfg.WinLen)
	sumw2 := 0.0
	for _, v := range w {
		sumw2 += v * v
	}
	scale := 1.0 / (cfg.Fs * sumw2)

	fft := fourier.NewFFT(nfft)
	outLen := nfft/2 + 1
	acc := make([]float64, outLen)
	buf := make([]float64, nfft)
	var spec []complex128
	windows := 0
	longest := 0
	for _, x := range pieces {
		longest = max(longest, len(x))
		for start := 0; start+cfg.WinLen <= len(x); start += step {
			windows++
			mean := 0.0
			for i := 0; i < cfg.WinLen; i++ {
				mean += x[start+i]
			}
			mean /= float64(cfg.WinLen)
			for i := 0; i < cfg.WinLen; i++ {
				buf[i] = (x[start+i] - mean) * w[i]
			}
			for i := cfg.WinLen; i < nfft; i++ {
				buf[i] = 0
			}
			spec = fft.Coefficients(spec, buf)
			for k := 0; k < outLen; k++ {
				re, im := real(spec[k]), imag(spec[k])
				p := (re*re + im*im) * scale
				if k != 0 && !(nfft%2 == 0 && k == nfft/2) {
					p *= 2
				}
				acc[k] += p
			}
		}
	}
	if windows == 0 {
		return nil, nil, 0, fmt.Errorf("no window of %d samples fits in the signal (longest piece: %d samples)", cfg.WinLen, longest)
	}

	df = cfg.Fs / float64(nfft)
	freq = make([]float64, outLen)
	psd = make([]float64, outLen)
	for k := range acc {
		psd[k] = acc[k] / float64(windows)
		freq[k] = float64(k) * df
	}
	return freq, psd, df, nil
}

// Windows is how many windows WelchPSDSegments averages for these pieces.
func Windows(pieces [][]float64, cfg WelchConfig) int {
	step := cfg.WinLen - int(math.Round(cfg.Overlap*float64(cfg.WinLen)))
	if cfg.WinLen <= 0 || step <= 0 {
		return 0
	}
	n := 0
	for _, x := range pieces {
		if len(x) >= cfg.WinLen {
			n += (len(x)-cfg.WinLen)/step + 1
		}
	}
	return n
}

func hann(n int) []float64 {
	w := make([]float64, n)
	if n == 1 {
		w[0] = 1
		return w
	}
	for i := range w {
		w[i] = 0.5 - 0.5*math.Cos(2*math.Pi*float64(i)/float64(n-1))
	}
	return w
}

func nextPow2(n int) int {
	p := 1
	for p < n {
		p <<= 1
	}
	return p
}
