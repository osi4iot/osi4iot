package function_library

import (
	"fmt"
	"math"
	"pipelines/common"
	"pipelines/logger"
	"sort"

	"gonum.org/v1/gonum/dsp/fourier"
)

type Dsp struct {
	node common.Node
	log  *logger.Logger
}

func NewDsp(node common.Node, log *logger.Logger) *Dsp {
	return &Dsp{
		node: node,
		log:  log,
	}
}

type WelchConfig struct {
	Fs               float64 // Hz
	WinLen           int     // samples per window (e.g. ≈ Fs * window_duration)
	Overlap          float64 // 0.0..0.95 (fraction)
	NFFT             int     // >= WinLen; if 0 => smallest 2^k >= WinLen
	ZeroPadToNFFT    bool    // if true use NFFT>=WinLen (recommended)
	MinFreq, MaxFreq float64 // band of interest [Hz], 0 to ignore
	MinProminenceDB  float64 // e.g., 6..12 dB
	MinDistanceHz    float64 // minimum separation between peaks (Hz)
	SmoothBins       int     // local median smoothing (odd bins), e.g., 9..21
}

type Peak struct {
	Freq        float64 // Hz (interpolated)
	Power       float64 // PSD (unit^2/Hz)
	PowerdB     float64 // 10*log10(PSD)
	PromdB      float64 // prominence in dB relative to local background
	BandwidthHz float64 // -3 dB bandwidth
	Q           float64 // f0 / BW
	Zeta        float64 // ≈ 1/(2Q)
	Idx         int     // bin index (for traceability)
}

type InterpolationConfig struct {
	TargetFs     float64 // target sampling rate (Hz)
	StartTime    float64 // start time (0 for automatic)
	EndTime      float64 // end time (0 for automatic)
	ExtrapolMode string  // "zero", "constant", "linear" for out-of-bounds values
}

// GetWelchConfig creates a WelchConfig with the specified parameters.
func (dsp *Dsp) GetWelchConfig(fs float64, winLen int, overlap float64, nfft int, zeroPadToNFFT bool, minFreq float64, maxFreq float64, minProminenceDB float64, minDistanceHz float64, smoothBins int) WelchConfig {
	var errMsg string = ""
	if fs <= 0 {
		errMsg = fmt.Sprintf("Invalid fs: %f (must be positive)", fs)
	}

	if winLen <= 0 {
		errMsg = fmt.Sprintf("Invalid winLen: %d (must be positive)", winLen)
	}

	if minFreq < 0 {
		errMsg = fmt.Sprintf("Invalid minFreq: %f (must be non-negative)", minFreq)
	}

	if maxFreq <= 0 {
		errMsg = fmt.Sprintf("Invalid maxFreq: %f (must be non-negative)", maxFreq)
	}

	if minFreq >= maxFreq {
		errMsg = fmt.Sprintf("Invalid freq band: minFreq (%f) must be less than maxFreq (%f)", minFreq, maxFreq)
	}

	if maxFreq > fs/2 {
		errMsg = fmt.Sprintf("Invalid maxFreq: %f (must be <= Nyquist %f)", maxFreq, fs/2)
	}

	if nfft < 0 || (nfft > 0 && nfft < winLen) {
		errMsg = fmt.Sprintf("Invalid nfft: %d (must be 0 or >= winLen %d)", nfft, winLen)
	}

	if overlap < 0 || overlap > 0.95 {
		errMsg = fmt.Sprintf("Invalid overlap: %f (must be in [0.0..0.95])", overlap)
	}

	if errMsg != "" {
		dsp.log.Errorf(errMsg)
		dsp.node.HandleError(fmt.Errorf("%s", errMsg))
		return WelchConfig{}
	}

	return WelchConfig{
		Fs:              fs,
		WinLen:          winLen,
		Overlap:         overlap,
		NFFT:            nfft,
		ZeroPadToNFFT:   zeroPadToNFFT,
		MinFreq:         minFreq,
		MaxFreq:         maxFreq,
		MinProminenceDB: minProminenceDB,
		MinDistanceHz:   minDistanceHz,
		SmoothBins:      smoothBins,
	}
}

// GetDefaultWelchConfig creates a WelchConfig with default parameters based on the sampling rate fs.
func (dsp *Dsp) GetDefaultWelchConfig(fs float64) WelchConfig {
	if fs <= 0 {
		errMsg := fmt.Sprintf("Invalid fs: %f (must be positive)", fs)
		dsp.log.Errorf(errMsg)
		dsp.node.HandleError(fmt.Errorf("%s", errMsg))
		return WelchConfig{}
	}

	winLen := int(2 * fs) // window base length 2 s
	nfftGuess := nextPow2(winLen)
	deltaF := fs / float64(nfftGuess)

	// min distance ≈ 3 * Δf (avoid duplicate peaks)
	minDistance := 3 * deltaF
	// ensure a practical minimum
	if minDistance < 0.05 { // practical floor
		minDistance = 0.05
	}

	return WelchConfig{
		Fs:              fs,
		WinLen:          winLen,
		Overlap:         0.5,
		NFFT:            0,
		ZeroPadToNFFT:   true,
		MinFreq:         0.0,
		MaxFreq:         0.0,
		MinProminenceDB: 4.0,
		MinDistanceHz:   minDistance, 
		SmoothBins:      9,
	}
}

// GetInterpolationConfig creates an InterpolationConfig with the specified parameters.
func (dsp *Dsp) GetInterpolationConfig(targetFs float64, startTime float64, endTime float64, extrapolMode string) InterpolationConfig {
	var errMsg string = ""
	if targetFs <= 0 {
		errMsg = fmt.Sprintf("Invalid targetFs: %f (must be positive)", targetFs)
	}

	if extrapolMode != "zero" && extrapolMode != "constant" && extrapolMode != "linear" {
		errMsg = fmt.Sprintf("Invalid extrapolMode: %s, possible options are 'zero', 'constant', 'linear'", extrapolMode)
	}

	if startTime < 0 {
		errMsg = fmt.Sprintf("Invalid startTime: %f (must be non-negative)", startTime)
	}

	if endTime < 0 {
		errMsg = fmt.Sprintf("Invalid endTime: %f (must be non-negative)", endTime)
	}

	if endTime != 0 && startTime != 0 && endTime <= startTime {
		errMsg = fmt.Sprintf("Invalid time range: startTime (%f) must be less than endTime (%f)", startTime, endTime)
	}

	if errMsg != "" {
		dsp.log.Errorf(errMsg)
		dsp.node.HandleError(fmt.Errorf("%s", errMsg))
		return InterpolationConfig{}
	}

	return InterpolationConfig{
		TargetFs:     targetFs,
		StartTime:    startTime,
		EndTime:      endTime,
		ExtrapolMode: extrapolMode,
	}
}

// DetrendInPlace removes linear trend from x (in place). Uses least squares to estimate slope and intercept.
// If len(x)<2, does nothing.
func (dsp *Dsp) DetrendInPlace(x []float64) {
	N := float64(len(x))
	if N < 2 {
		return
	}
	var sum, sumIdx, sumValIdx float64
	for i, v := range x {
		sum += v
		sumIdx += float64(i)
		sumValIdx += float64(i) * v
	}
	mean := sum / N
	// slope (least squares)
	den := (N*sumSquares0toNminus1(len(x)) - sumIdx*sumIdx)
	var slope float64
	if math.Abs(den) > 1e-12 {
		slope = (N*sumValIdx - sumIdx*sum) / den
	}
	// intercept
	inter := mean - slope*(sumIdx/N)
	for i := range x {
		x[i] = x[i] - (inter + slope*float64(i))
	}
}

// welchPSD computes PSD (power spectral density) in unit^2/Hz.
// Scaling convention similar to SciPy: Pxx = (2/(fs*sum(w^2))) |X[k]|^2
// (factor 2 only for 0<k<Nfft/2; DC/Nyquist not doubled). Averages over segments.
// Returns: freq (0..Nyquist), psd, df and K (number of averages).
func (dsp *Dsp) WelchPSD(x []float64, cfg WelchConfig) (freq, psd []float64, df float64) {
	N := len(x)
	if cfg.WinLen <= 0 || cfg.WinLen > N {
		dsp.log.Errorf("Invalid WinLen: %d (N=%d)", cfg.WinLen, N)
		return
	}
	overSamp := int(math.Round(cfg.Overlap * float64(cfg.WinLen)))
	if overSamp < 0 || overSamp >= cfg.WinLen {
		dsp.log.Errorf("Invalid Overlap: %d (WinLen=%d)", overSamp, cfg.WinLen)
		return
	}
	step := cfg.WinLen - overSamp

	// NFFT
	nfft := cfg.NFFT
	if nfft <= 0 {
		nfft = nextPow2(cfg.WinLen)
	}
	if !cfg.ZeroPadToNFFT {
		nfft = cfg.WinLen
	}

	// Hann window and metrics
	w := hann(cfg.WinLen)
	sumw2 := 0.0
	for i := range w {
		sumw2 += w[i] * w[i]
	}

	rfft := fourier.NewFFT(nfft)
	outLen := nfft/2 + 1
	acc := make([]float64, outLen)
	temp := make([]float64, nfft)

	K := 0
	// Sweep through segments
	for start := 0; start+cfg.WinLen <= N; start += step {
		K++
		// copy segment and apply window (with zero-padding if nfft>WinLen)
		for i := 0; i < cfg.WinLen; i++ {
			temp[i] = x[start+i] * w[i]
		}
		for i := cfg.WinLen; i < nfft; i++ {
			temp[i] = 0
		}

		// FFT real
		spec := rfft.Coefficients(nil, temp) // len = outLen (complejos)

		// Unilateral power spectral periodogram
		// Pxx = (1/(fs*sum(w^2))) * |X|^2 ; y *2 excepto DC y Nyquist
		// Note: Gonum FFT does not normalize by N; this keeps the density
		// consistent with the Welch convention (constant-factor differences
		// do not affect peak locations).
		scale := 1.0 / (cfg.Fs * sumw2)
		for k := 0; k < outLen; k++ {
			re := real(spec[k])
			im := imag(spec[k])
			p := (re*re + im*im) * scale
			if k != 0 && k != nfft/2 {
				p *= 2.0
			}
			acc[k] += p
		}
	}

	if K == 0 {
		dsp.log.Errorf("Could not form any segment (WinLen/Overlap incompatible with N)")
		return
	}

	// Average
	psd = make([]float64, outLen)
	for k := 0; k < outLen; k++ {
		psd[k] = acc[k] / float64(K)
	}

	// Frequencies
	df = cfg.Fs / float64(nfft)
	freq = make([]float64, outLen)
	for k := 0; k < outLen; k++ {
		freq[k] = float64(k) * df
	}
	return
}

// findPeaksWelch: peak detection using prominence (dB), minimum distance (Hz)
// and parabolic refinement on log-PSD. Returns peaks inside [MinFreq,MaxFreq].
func (dsp *Dsp) FindWelchPeaks(freq, psd []float64, df float64, cfg WelchConfig) []Peak {
	n := len(psd)
	if n < 3 {
		return nil
	}

	// Local baseline: sliding median (for colored noise)
	// Use odd window (e.g., 11 bins).
	win := cfg.SmoothBins
	if win < 5 || win%2 == 0 {
		win = 11
	}
	bg := medianSmooth(psd, win)

	// Convert to dB
	psdDB := make([]float64, n)
	bgDB := make([]float64, n)
	for i := 0; i < n; i++ {
		psdDB[i] = 10 * math.Log10(psd[i]+1e-300)
		bgDB[i] = 10 * math.Log10(bg[i]+1e-300)
	}

	minK := 1
	maxK := n - 2
	if cfg.MinFreq > 0 {
		minK = int(math.Ceil(cfg.MinFreq / df))
		if minK < 1 {
			minK = 1
		}
	}
	if cfg.MaxFreq > 0 && cfg.MaxFreq < freq[n-1] {
		maxK = int(math.Floor(cfg.MaxFreq / df))
		if maxK > n-2 {
			maxK = n - 2
		}
	}
	if maxK <= minK {
		return nil
	}

	// Peak candidates (local maxima)
	cands := make([]int, 0, 32)
	for k := minK; k <= maxK; k++ {
		if psd[k] > psd[k-1] && psd[k] > psd[k+1] {
			// Prominence vs local background
			prom := psdDB[k] - bgDB[k]
			if prom >= cfg.MinProminenceDB {
				cands = append(cands, k)
			}
		}
	}
	if len(cands) == 0 {
		return nil
	}

	// Enforce minimum distance between peaks (in Hz)
	minDistBins := int(math.Round(cfg.MinDistanceHz / df))
	if minDistBins < 1 {
		minDistBins = 1
	}
	// Ordenar candidatos por altura descendente
	sort.Slice(cands, func(i, j int) bool { return psd[cands[i]] > psd[cands[j]] })
	keep := make([]int, 0, len(cands))
	taken := make([]bool, len(psd))
	for _, k := range cands {
		if taken[k] {
			continue
		}
		keep = append(keep, k)
		lo := maxInt(0, k-minDistBins)
		hi := minInt(len(psd)-1, k+minDistBins)
		for i := lo; i <= hi; i++ {
			taken[i] = true
		}
	}

	// Parabolic refinement (log-PSD)
	peaks := make([]Peak, 0, len(keep))
	for _, k := range keep {
		if k <= 0 || k >= len(psd)-1 {
			continue
		}
		y1 := 10 * math.Log10(psd[k-1]+1e-300)
		y2 := 10 * math.Log10(psd[k]+1e-300)
		y3 := 10 * math.Log10(psd[k+1]+1e-300)
		den := (y1 - 2*y2 + y3)
		var delta float64
		if math.Abs(den) > 1e-12 {
			delta = 0.5 * (y1 - y3) / den // displacement in bins (-0.5..0.5 approx.)
		} else {
			delta = 0
		}
		f0 := (float64(k) + delta) * df

		// Interpolated PSD value (exponentiate back)
		// Parabola in dB => convert vertex to approximate linear value
		yv := y2 - 0.25*(y1-y3)*delta // dB value of the vertex
		pwr := math.Pow(10, yv/10.0)

		peaks = append(peaks, Peak{
			Freq:    f0,
			Power:   pwr,
			PowerdB: yv,
			PromdB:  yv - bgDB[k],
			Idx:     k,
		})
	}

	for i := range peaks {
		bw := halfPowerBandwidth(freq, psd, peaks[i].Idx)
		peaks[i].BandwidthHz = bw
		if bw > 0 {
			peaks[i].Q = peaks[i].Freq / bw
			peaks[i].Zeta = 1.0 / (2.0 * peaks[i].Q)
		}
	}

	// Sort by PSD descending
	sort.Slice(peaks, func(i, j int) bool { return peaks[i].Power > peaks[j].Power })

	return peaks
}

// SortTimeSeriesData sorts the TimeSeriesData by the 'times' field, maintaining the correspondence with 'values'.
func (dsp *Dsp) SortTimeSeriesData(times, values []float64) ([]float64, []float64) {
	type pair struct {
		time  float64
		value float64
	}
	pairs := make([]pair, len(times))
	for i := range times {
		pairs[i] = pair{times[i], values[i]}
	}

	sort.Slice(pairs, func(i, j int) bool {
		return pairs[i].time < pairs[j].time
	})

	sortedTimes := make([]float64, len(pairs))
	sortedValues := make([]float64, len(pairs))

	for i, p := range pairs {
		sortedTimes[i] = p.time
		sortedValues[i] = p.value
	}

	return sortedTimes, sortedValues
}

// EstimateUniformSamplingRate estimates a uniform sampling rate from time stamps.
func (dsp *Dsp) EstimateUniformSamplingRate(times []float64, method string) float64 {
	if len(times) < 2 {
		return 1.0
	}

	if method != "min" && method != "median" && method != "mean" {
		errMsg := fmt.Sprintf("Invalid method: %s (must be 'min', 'median' or 'mean')", method)
		dsp.log.Errorf(errMsg)
		dsp.node.HandleError(fmt.Errorf("%s", errMsg))
		return 1.0
	}

	// Calcular intervalos
	intervals := make([]float64, len(times)-1)
	for i := 0; i < len(times)-1; i++ {
		intervals[i] = times[i+1] - times[i]
	}

	switch method {
	case "min":
		// Use the minimum interval
		minInterval := intervals[0]
		for _, dt := range intervals[1:] {
			if dt < minInterval {
				minInterval = dt
			}
		}
		return 1.0 / minInterval

	case "median":
		// Use the median of the intervals
		sort.Float64s(intervals)
		median := intervals[len(intervals)/2]
		return 1.0 / median

	case "mean":
		fallthrough
	default:
		// Use the mean interval
		sum := 0.0
		for _, dt := range intervals {
			sum += dt
		}
		meanInterval := sum / float64(len(intervals))
		return 1.0 / meanInterval
	}
}

// InterpolateToUniform interpolates the given time series data to a uniform grid.
// times and values must have the same length.
// config specifies the target sampling rate and time range.
// Returns the interpolated values on a uniform grid.
func (dsp *Dsp) InterpolateToUniform(times, values []float64, config InterpolationConfig) []float64 {
	if len(times) != len(values) {
		dsp.node.HandleError(fmt.Errorf("times and values must have the same length"))
		return nil
	}
	if len(times) < 2 {
		dsp.node.HandleError(fmt.Errorf("need at least 2 data points"))
		return nil
	}
	if config.TargetFs <= 0 {
		dsp.node.HandleError(fmt.Errorf("TargetFs must be positive"))
		return nil
	}

	// Determine time range
	startTime := config.StartTime
	endTime := config.EndTime
	if startTime == 0 {
		startTime = times[0]
	}
	if endTime == 0 {
		endTime = times[len(times)-1]
	}
	if endTime <= startTime {
		dsp.node.HandleError(fmt.Errorf("endTime must be greater than startTime"))
		return nil
	}

	// Sort data by time (in case it's not sorted)
	sortedTimes, sortedValues := dsp.SortTimeSeriesData(times, values)

	// Generate uniform grid
	dt := 1.0 / config.TargetFs
	numPoints := int(math.Ceil((endTime-startTime)/dt)) + 1
	result := make([]float64, numPoints)

	for i := range numPoints {
		t := startTime + float64(i)*dt
		result[i] = dsp.linearInterpolate(sortedTimes, sortedValues, t, config.ExtrapolMode)
	}

	return result
}

// LinearInterpolate performs linear interpolation for the given time t.
// times must be sorted in ascending order.
// extrapolMode: "zero", "constant", "linear" for out-of-bounds values.
func (dsp *Dsp) linearInterpolate(times, values []float64, t float64, extrapolMode string) float64 {
	n := len(times)

	// Casos de extrapolación
	if t < times[0] {
		return handleExtrapolation(times, values, t, true, extrapolMode)
	}
	if t > times[n-1] {
		return handleExtrapolation(times, values, t, false, extrapolMode)
	}

	// Find the right interval
	i := findInterval(times, t)
	if i == n-1 {
		return values[i]
	}

	// Interpolación lineal
	// Linear interpolation formula:
	dt := times[i+1] - times[i]
	if math.Abs(dt) < 1e-12 {
		return values[i]
	}

	alpha := (t - times[i]) / dt
	return values[i]*(1-alpha) + values[i+1]*alpha
}

// halfPowerBandwidth: find -3 dB points left/right of the peak
// (linear in frequency, on the psd vector). If both sides not found, return 0.
func halfPowerBandwidth(freq, psd []float64, k int) float64 {
	if k <= 0 || k >= len(psd)-1 {
		return 0
	}
	p0 := psd[k]
	th := p0 / math.Pow(10, 3.0/10.0) // -3 dB => factor ~0.5

	// Izquierda
	fi := -1
	for i := k - 1; i > 0; i-- {
		if psd[i] <= th {
			fi = i
			break
		}
	}
	// Derecha
	fj := -1
	for j := k + 1; j < len(psd)-1; j++ {
		if psd[j] <= th {
			fj = j
			break
		}
	}
	if fi == -1 || fj == -1 {
		return 0
	}
	return freq[fj] - freq[fi]
}

func sumSquares0toNminus1(n int) float64 {
	// sum_{i=0}^{n-1} i^2 = (n-1)n(2n-1)/6
	ni := float64(n)
	return (ni - 1) * ni * (2*ni - 1) / 6.0
}

func medianSmooth(x []float64, win int) []float64 {
	if win < 3 || win%2 == 0 {
		return append([]float64(nil), x...)
	}
	n := len(x)
	half := win / 2
	out := make([]float64, n)
	buf := make([]float64, 0, win)
	for i := 0; i < n; i++ {
		buf = buf[:0]
		lo := maxInt(0, i-half)
		hi := minInt(n-1, i+half)
		for j := lo; j <= hi; j++ {
			buf = append(buf, x[j])
		}
		sort.Float64s(buf)
		out[i] = buf[len(buf)/2]
	}
	return out
}

func hann(n int) []float64 {
	w := make([]float64, n)
	if n == 1 {
		w[0] = 1
		return w
	}
	for i := 0; i < n; i++ {
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

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// handleExtrapolation handles extrapolation based on the specified mode.
func handleExtrapolation(times, values []float64, t float64, isLeft bool, mode string) float64 {
	switch mode {
	case "zero":
		return 0
	case "constant":
		if isLeft {
			return values[0]
		}
		return values[len(values)-1]
	case "linear":
		if isLeft && len(values) >= 2 {
			// Linear extrapolation using the first two points
			slope := (values[1] - values[0]) / (times[1] - times[0])
			return values[0] + slope*(t-times[0])
		} else if !isLeft && len(values) >= 2 {
			// Linear extrapolation using the last two points
			n := len(values)
			slope := (values[n-1] - values[n-2]) / (times[n-1] - times[n-2])
			return values[n-1] + slope*(t-times[n-1])
		}
		fallthrough
	default:
		if isLeft {
			return values[0]
		}
		return values[len(values)-1]
	}
}

// findInterval finds the index of the interval that contains t
func findInterval(times []float64, t float64) int {
	n := len(times)
	if t <= times[0] {
		return 0
	}
	if t >= times[n-1] {
		return n - 1
	}

	// Búsqueda binaria
	left, right := 0, n-1
	for left < right-1 {
		mid := (left + right) / 2
		if times[mid] <= t {
			left = mid
		} else {
			right = mid
		}
	}
	return left
}
