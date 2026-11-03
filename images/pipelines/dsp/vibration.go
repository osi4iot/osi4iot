package dsp

// Vibration features of a block of samples: time-domain indicators, band
// powers from the Welch PSD, the dominant frequency with its damping, and
// the velocity RMS of an acceleration (ISO 10816/20816).

import (
	"errors"
	"fmt"
	"math"
)

// Band is a frequency band (Hz).
type Band struct {
	Name string  `json:"name"`
	From float64 `json:"from"`
	To   float64 `json:"to"`
}

// VibrationOptions configures VibrationFeatures.
type VibrationOptions struct {
	Fs float64 // sampling rate (Hz)
	// Welch window (samples); 0: automatic (a power of two that gives
	// several windows with 50 % overlap when the block allows it)
	SegmentLength int
	Bands         []Band
	// Velocity RMS of an acceleration, integrated in the frequency domain
	// over [VelocityFrom, VelocityTo] Hz (0, 0: no velocity). AccelToMS2
	// converts the samples to m/s² (1 for m/s², 9.80665 for g); the result
	// is in mm/s.
	VelocityFrom, VelocityTo float64
	AccelToMS2               float64
	// Peak search for the dominant frequency (0: the whole band, 4 dB)
	MinFreq, MaxFreq float64
	MinProminenceDB  float64
}

// VibrationFeatures are the indicators of a block.
type VibrationFeatures struct {
	Samples      int                `json:"samples"`
	DurationS    float64            `json:"durationSeconds"`
	Mean         float64            `json:"mean"`
	Std          float64            `json:"std"`
	RMS          float64            `json:"rms"`        // of the signal without its mean (AC)
	Peak         float64            `json:"peak"`       // max |x - mean|
	PeakToPeak   float64            `json:"peakToPeak"` // max - min
	CrestFactor  float64            `json:"crestFactor"`
	Kurtosis     float64            `json:"kurtosis"` // 3 for Gaussian noise, 1.5 for a sine
	Skewness     float64            `json:"skewness"`
	ShapeFactor  float64            `json:"shapeFactor"`     // RMS / mean |x|
	Impulse      float64            `json:"impulseFactor"`   // peak / mean |x|
	Bands        map[string]float64 `json:"bands,omitempty"` // RMS in each band (from the PSD)
	Dominant     *Peak              `json:"dominant,omitempty"`
	Peaks        []Peak             `json:"peaks,omitempty"`
	VelocityRMS  *float64           `json:"velocityRmsMmS,omitempty"`
	ResolutionHz float64            `json:"resolutionHz"`
}

// ComputeVibrationFeatures computes the indicators of x (at least 16 samples).
func ComputeVibrationFeatures(x []float64, o VibrationOptions) (VibrationFeatures, error) {
	var f VibrationFeatures
	if len(x) < 16 {
		return f, fmt.Errorf("a block needs at least 16 samples, it has %d", len(x))
	}
	if !(o.Fs > 0) {
		return f, errors.New("the sampling rate must be positive")
	}
	m := ComputeMoments(x)
	f.Samples, f.DurationS = len(x), float64(len(x))/o.Fs
	f.Mean, f.Std, f.Kurtosis, f.Skewness = m.Mean, m.Std, m.Kurtosis, m.Skewness
	f.PeakToPeak = m.Max - m.Min
	sumSq, sumAbs := 0.0, 0.0
	for _, v := range x {
		d := v - m.Mean
		sumSq += d * d
		sumAbs += math.Abs(d)
		f.Peak = math.Max(f.Peak, math.Abs(d))
	}
	n := float64(len(x))
	f.RMS = math.Sqrt(sumSq / n)
	meanAbs := sumAbs / n
	if f.RMS > 0 {
		f.CrestFactor = f.Peak / f.RMS
	}
	if meanAbs > 0 {
		f.ShapeFactor = f.RMS / meanAbs
		f.Impulse = f.Peak / meanAbs
	}

	// spectrum
	seg := o.SegmentLength
	if seg <= 0 {
		seg = autoSegment(len(x))
	}
	if seg > len(x) {
		seg = len(x)
	}
	prominence := o.MinProminenceDB
	if prominence <= 0 {
		prominence = 4
	}
	// peaks at least 3 bins apart over a background smoothed over 9 bins, as DefaultWelchConfig
	cfg, err := NewWelchConfig(o.Fs, seg, 0.5, 0, true, o.MinFreq, o.MaxFreq, prominence, 3*o.Fs/float64(nextPow2(seg)), 9)
	if err != nil {
		return f, err
	}
	freq, psd, df, err := WelchPSD(x, cfg)
	if err != nil {
		return f, err
	}
	f.ResolutionHz = df
	if len(o.Bands) > 0 {
		f.Bands = map[string]float64{}
		for _, b := range o.Bands {
			f.Bands[b.Name] = math.Sqrt(BandPower(freq, psd, df, b.From, b.To))
		}
	}
	peaks := FindPeaks(freq, psd, df, cfg)
	if len(peaks) > 0 {
		dominant := peaks[0]
		f.Dominant = &dominant
		if len(peaks) > 5 {
			peaks = peaks[:5]
		}
		f.Peaks = peaks
	}
	if o.VelocityTo > o.VelocityFrom && o.VelocityTo > 0 {
		scale := o.AccelToMS2
		if scale <= 0 {
			scale = 1
		}
		v := 1000 * scale * math.Sqrt(VelocityPower(freq, psd, df, o.VelocityFrom, o.VelocityTo))
		f.VelocityRMS = &v
	}
	return f, nil
}

// autoSegment: a power of two that gives at least 3 windows (50 % overlap)
// when the block has 512 samples or more; else the largest power of two
// that fits.
func autoSegment(n int) int {
	p := 1
	for p*2 <= n {
		p *= 2
	}
	if n >= 512 && p*2 > n {
		p /= 2
	}
	return p
}

// BandPower integrates a one-sided PSD over [from, to] Hz (the mean square
// in that band); to <= 0 means up to the last bin.
func BandPower(freq, psd []float64, df, from, to float64) float64 {
	sum := 0.0
	for i, f := range freq {
		if f < from || (to > 0 && f > to) {
			continue
		}
		sum += psd[i] * df
	}
	return sum
}

// VelocityPower is the mean square velocity over [from, to] Hz from an
// acceleration PSD (divided by (2πf)²; the DC bin is skipped).
func VelocityPower(freq, psd []float64, df, from, to float64) float64 {
	sum := 0.0
	for i, f := range freq {
		if f <= 0 || f < from || f > to {
			continue
		}
		w := 2 * math.Pi * f
		sum += psd[i] / (w * w) * df
	}
	return sum
}
