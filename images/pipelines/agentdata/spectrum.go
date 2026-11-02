package agentdata

import (
	"fmt"
	"math"
	"net/http"
	"strconv"

	"gonum.org/v1/plot"
	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/vg"
	"gonum.org/v1/plot/vg/draw"

	"pipelines/dsp"
)

// The spectrum (sensor-spectrum): the power spectral density of one or
// several fields of a sensor with Welch's method (package pipelines/dsp,
// the same as the Function nodes' go.dsp), and its peaks: the natural
// frequencies of a structure, the frequency of a machine, a vibration.
//
// The values are resampled at the sensor's own rate (the median interval
// between messages) in the pieces between gaps, never across a gap, and
// the windows of all the pieces are averaged.

const (
	// MaxSpectrumSamples bounds the values read for a spectrum.
	MaxSpectrumSamples = 200000
	// MaxSpectrumFields bounds the fields of one spectrum.
	MaxSpectrumFields = 3
	// maxPeaksReported per field.
	maxPeaksReported = 6
	// minWindows a spectrum needs to be stable.
	minWindows = 4
)

// SpectrumField is a field's spectrum, as the tool summarizes it.
type SpectrumField struct {
	Field   Field      `json:"field"`
	Samples int        `json:"samples"`
	RMS     float64    `json:"rms"` // in the band drawn, from the PSD
	Peaks   []dsp.Peak `json:"peaks"`

	freq, psd []float64
}

func (s *Service) handleSpectrum(w http.ResponseWriter, r *http.Request) {
	c, base, ok := s.chartCall(w, r)
	if !ok {
		return
	}
	fields, err := chartFields(base.sensor, c)
	if err == nil && len(fields) > MaxSpectrumFields {
		err = fmt.Errorf("a spectrum draws at most %d fields", MaxSpectrumFields)
	}
	if err == nil && (c.FreqMin < 0 || c.FreqMax < 0 || (c.FreqMax > 0 && c.FreqMin >= c.FreqMax) || c.Resolution < 0) {
		err = fmt.Errorf("invalid band or resolution: freq_min < freq_max, both >= 0; resolution > 0")
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rows, truncated, err := rawRows(r.Context(), s.db, c.groupUid, base.sensor, fields, base.from, base.to, MaxSpectrumSamples)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(rows) == 0 {
		base.noValues(w)
		return
	}

	// The sampling rate: the median interval between the messages.
	times := make([]float64, len(rows))
	for i, row := range rows {
		times[i] = unixSeconds(row.Time)
	}
	fs, err := dsp.EstimateSamplingRate(times, "median")
	if err != nil {
		writeError(w, http.StatusBadRequest, "the sampling rate cannot be estimated: "+err.Error())
		return
	}
	nyquist := fs / 2
	if c.FreqMin >= nyquist {
		writeError(w, http.StatusBadRequest, fmt.Sprintf(
			"the sensor sends about %.3g values per second: its spectrum reaches %.3g Hz (half of it), below freq_min %g Hz", fs, nyquist, c.FreqMin))
		return
	}
	freqMax := c.FreqMax
	clipped := false
	if freqMax == 0 || freqMax > nyquist {
		clipped = freqMax > nyquist
		freqMax = nyquist
	}

	spectra := make([]SpectrumField, 0, len(fields))
	var cfg dsp.WelchConfig
	windows, pieces := 0, 0
	for i, f := range fields {
		var t, v []float64
		for _, row := range rows {
			if row.Values[i] != nil {
				t = append(t, unixSeconds(row.Time))
				v = append(v, *row.Values[i])
			}
		}
		parts := dsp.UniformPieces(t, v, fs, 3/fs, 16)
		longest := 0
		for _, p := range parts {
			longest = max(longest, len(p))
		}
		if i == 0 {
			cfg, err = spectrumConfig(fs, longest, c.Resolution, c.FreqMin, freqMax)
			if err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			windows, pieces = dsp.Windows(parts, cfg), len(parts)
			if windows < minWindows {
				writeError(w, http.StatusBadRequest, fmt.Sprintf(
					"too few data for a stable spectrum: %d windows of %.3g s fit (at least %d are needed). Use a longer range, or a coarser resolution",
					windows, float64(cfg.WinLen)/fs, minWindows))
				return
			}
		}
		freq, psd, df, err := dsp.WelchPSDSegments(parts, cfg)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("%s: %v", f.Name, err))
			return
		}
		peaks := dsp.FindPeaks(freq, psd, df, cfg)
		if len(peaks) > maxPeaksReported {
			peaks = peaks[:maxPeaksReported]
		}
		power := 0.0
		for k := range psd {
			if freq[k] >= c.FreqMin && freq[k] <= freqMax {
				power += psd[k] * df
			}
		}
		spectra = append(spectra, SpectrumField{Field: f, Samples: len(v), RMS: math.Sqrt(power), Peaks: peaks, freq: freq, psd: psd})
	}

	title := chartTitle(c.Title, base.defaultTitle()+" – spectrum")
	logScale := c.LogScale == nil || *c.LogScale
	png, err := renderSpectrum(title, spectra, c.FreqMin, freqMax, logScale)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "the spectrum could not be drawn: "+err.Error())
		return
	}
	out := base.answer(title)
	df := fs / float64(cfg.WinLen)
	if cfg.ZeroPadToNFFT {
		df = fs / float64(nextPow2(cfg.WinLen))
	}
	out["sampling_rate_hz"] = fs
	out["nyquist_hz"] = nyquist
	out["band_hz"] = []float64{c.FreqMin, freqMax}
	out["band_clipped_to_nyquist"] = clipped
	out["resolution_hz"] = df
	out["window_s"] = float64(cfg.WinLen) / fs
	out["windows"] = windows
	out["pieces"] = pieces // more than 1: there were gaps in the data
	out["truncated"] = truncated
	out["fields"] = spectra
	if err := s.saveChart(c, title, png, out); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// spectrumConfig chooses the windows: the resolution asked, else the
// longest window that still gives about 8 windows of the longest piece
// (power of 2, 16 to 16384 samples).
func spectrumConfig(fs float64, longest int, resolution, fmin, fmax float64) (dsp.WelchConfig, error) {
	cfg, err := dsp.DefaultWelchConfig(fs)
	if err != nil {
		return cfg, err
	}
	var win int
	if resolution > 0 {
		win = nextPow2(int(math.Ceil(fs / resolution)))
	} else {
		win = 16
		for win*2 <= 16384 && win*2 <= longest*2/9 {
			win *= 2
		}
	}
	if win < 16 {
		win = 16
	}
	cfg.WinLen = win
	cfg.NFFT = 0
	cfg.ZeroPadToNFFT = true
	cfg.MinFreq = fmin
	if fmax < fs/2 {
		cfg.MaxFreq = fmax
	}
	df := fs / float64(nextPow2(win))
	cfg.MinDistanceHz = 3 * df
	cfg.MinProminenceDB = 6
	return cfg, cfg.Validate()
}

func nextPow2(n int) int {
	p := 1
	for p < n {
		p <<= 1
	}
	return p
}

func renderSpectrum(title string, spectra []SpectrumField, fmin, fmax float64, logScale bool) ([]byte, error) {
	p := newPlot(title)
	p.X.Label.Text = "Hz"
	p.X.Min, p.X.Max = fmin, fmax
	fields := make([]Field, len(spectra))
	for i, s := range spectra {
		fields[i] = s.Field
	}
	units := prettyUnits(commonUnits(fields))
	if units != "" {
		p.Y.Label.Text = "PSD (" + units + ")²/Hz"
	} else {
		p.Y.Label.Text = "PSD (units²/Hz)"
	}

	// The DC bin and the bins outside the band are left out; on a log axis,
	// values below 1e-8 of the highest are drawn at that floor.
	top := 0.0
	for _, s := range spectra {
		for k := 1; k < len(s.psd); k++ {
			if s.freq[k] >= fmin && s.freq[k] <= fmax {
				top = math.Max(top, s.psd[k])
			}
		}
	}
	if top <= 0 {
		top = 1
	}
	floor := top * 1e-8 // 8 decades below the highest: the noise floor, readable
	if logScale {
		p.Y.Scale = plot.LogScale{}
		p.Y.Tick.Marker = decadeTicks{}
	}

	var legend []legendEntry
	yMin := math.Inf(1)
	for i, s := range spectra {
		col := paletteColor(i)
		var pts plotter.XYs
		for k := 1; k < len(s.psd); k++ {
			if s.freq[k] < fmin || s.freq[k] > fmax {
				continue
			}
			y := s.psd[k]
			if logScale && y < floor {
				y = floor
			}
			yMin = math.Min(yMin, y)
			pts = append(pts, plotter.XY{X: s.freq[k], Y: y})
		}
		if len(pts) < 2 {
			continue
		}
		line, err := plotter.NewLine(pts)
		if err != nil {
			return nil, err
		}
		line.Color, line.Width = col, vg.Points(1.3)
		p.Add(line)
		if len(spectra) > 1 {
			legend = append(legend, legendEntry{fieldLabel(s.Field, false), line})
		}

		// The peaks: a dot and the frequency.
		var marks plotter.XYs
		var texts []string
		for _, pk := range s.Peaks {
			if pk.Freq < fmin || pk.Freq > fmax {
				continue
			}
			marks = append(marks, plotter.XY{X: pk.Freq, Y: math.Max(pk.Power, floor)})
			texts = append(texts, fmt.Sprintf("%.3g Hz", pk.Freq))
		}
		if len(marks) > 0 {
			sc, err := plotter.NewScatter(marks)
			if err != nil {
				return nil, err
			}
			sc.Color, sc.Radius = col, vg.Points(3)
			p.Add(sc)
			labels, err := plotter.NewLabels(plotter.XYLabels{XYs: marks, Labels: texts})
			if err != nil {
				return nil, err
			}
			for k := range labels.TextStyle {
				restyle(&labels.TextStyle[k], 9)
				labels.TextStyle[k].XAlign = draw.XCenter
				labels.TextStyle[k].YAlign = draw.YBottom
			}
			labels.Offset = vg.Point{Y: vg.Points(5)}
			p.Add(labels)
		}
	}
	if logScale && !math.IsInf(yMin, 0) {
		p.Y.Min = math.Max(yMin, floor) / 2
		p.Y.Max = top * 8 // room for the labels of the peaks
	} else {
		p.Y.Min = 0
		p.Y.Max = top * 1.15
	}
	return renderPNG(p, legendPanel(p, legend))
}

// decadeTicks puts a labelled tick on each power of 10 (every other one
// beyond 8 decades), written as 0.01, 100 or 1e-05.
type decadeTicks struct{}

func (decadeTicks) Ticks(min, max float64) []plot.Tick {
	if min <= 0 || max <= min {
		return nil
	}
	lo, hi := int(math.Floor(math.Log10(min))), int(math.Ceil(math.Log10(max)))
	step := 1
	if hi-lo > 8 {
		step = 2
	}
	var ticks []plot.Tick
	for e := lo; e <= hi; e++ {
		v := math.Pow(10, float64(e))
		if v < min || v > max {
			continue
		}
		label := ""
		if (e-lo)%step == 0 {
			if e >= -3 && e <= 4 {
				label = strconv.FormatFloat(v, 'f', -1, 64)
			} else {
				label = fmt.Sprintf("1e%d", e)
			}
		}
		ticks = append(ticks, plot.Tick{Value: v, Label: label})
	}
	return ticks
}
