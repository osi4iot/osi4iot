package nodes

// Vibration node logic: dsp's vibration features of blocks of samples,
// given as an array per message (a burst of a vibration sensor) or
// gathered from single values (a stream) into windows.

import (
	"fmt"

	"pipelines/dsp"
)

// vibrationMaxBuffer caps the samples kept per key for a stream.
const vibrationMaxBuffer = 32768

type vibrationConfig struct {
	Field   string
	Mode    string // "block" or "stream"
	Fs      float64
	FsPath  string // block: the sampling rate in the message, when it has it
	Window  int    // stream: samples per window
	Hop     int    // stream: samples between windows (Window: no overlap)
	Options dsp.VibrationOptions
	KeyPath string
	Peaks   bool // include the main peaks
}

// vibrationState: the samples of a stream not yet used in a window.
type vibrationState struct {
	Buffer []float64 `json:"buffer"`
	Topic  string    `json:"topic,omitempty"`
}

func parseVibrationConfig(settings map[string]any) (*vibrationConfig, error) {
	cfg := &vibrationConfig{
		Field:   settingString(settings, "field", "payload.value"),
		Mode:    settingString(settings, "mode", "stream"),
		Fs:      settingNumber(settings, "fs", 0),
		FsPath:  settingString(settings, "fsPath", ""),
		Window:  int(settingNumber(settings, "windowSamples", 256)),
		Hop:     int(settingNumber(settings, "hopSamples", 0)),
		KeyPath: settingString(settings, "keyPath", ""),
		Peaks:   settingBool(settings, "includePeaks", false),
	}
	cfg.Options = dsp.VibrationOptions{
		SegmentLength:   int(settingNumber(settings, "segmentLength", 0)),
		MinFreq:         settingNumber(settings, "minFreq", 0),
		MaxFreq:         settingNumber(settings, "maxFreq", 0),
		MinProminenceDB: settingNumber(settings, "minProminenceDB", 0),
	}
	if !(cfg.Fs > 0) && cfg.FsPath == "" {
		return nil, fmt.Errorf("the sampling rate is required")
	}
	switch cfg.Mode {
	case "block":
	case "stream":
		if cfg.Window < 16 || cfg.Window > vibrationMaxBuffer {
			return nil, fmt.Errorf("the window must have 16 to %d samples", vibrationMaxBuffer)
		}
		if cfg.Hop <= 0 {
			cfg.Hop = cfg.Window
		}
		if cfg.Hop > cfg.Window {
			return nil, fmt.Errorf("the step cannot be longer than the window")
		}
		if !(cfg.Fs > 0) {
			return nil, fmt.Errorf("a stream needs the sampling rate")
		}
	default:
		return nil, fmt.Errorf("mode must be block or stream")
	}
	for i, raw := range settingMaps(settings, "bands") {
		from, ok1 := toNumber(raw["from"])
		to, ok2 := toNumber(raw["to"])
		if !ok1 || !ok2 || from < 0 || to <= from {
			return nil, fmt.Errorf("band %d: from must be below to", i+1)
		}
		name := settingString(raw, "name", fmt.Sprintf("%g-%g", from, to))
		cfg.Options.Bands = append(cfg.Options.Bands, dsp.Band{Name: name, From: from, To: to})
	}
	if settingBool(settings, "velocity", false) {
		cfg.Options.VelocityFrom = settingNumber(settings, "velocityFrom", 10)
		cfg.Options.VelocityTo = settingNumber(settings, "velocityTo", 1000)
		if cfg.Options.VelocityTo <= cfg.Options.VelocityFrom {
			return nil, fmt.Errorf("the velocity band is empty")
		}
		cfg.Options.AccelToMS2 = 1
		if settingString(settings, "accelUnit", "m/s2") == "g" {
			cfg.Options.AccelToMS2 = 9.80665
		}
	}
	return cfg, nil
}

// features computes the features of one block, as an output payload.
func (c *vibrationConfig) features(block []float64, fs float64) (map[string]any, error) {
	o := c.Options
	o.Fs = fs
	if o.MaxFreq > fs/2 {
		o.MaxFreq = 0
	}
	if o.VelocityTo > fs/2 {
		o.VelocityTo = fs / 2
	}
	f, err := dsp.ComputeVibrationFeatures(block, o)
	if err != nil {
		return nil, err
	}
	out := map[string]any{
		"samples":         f.Samples,
		"fs":              fs,
		"durationSeconds": f.DurationS,
		"mean":            f.Mean,
		"std":             f.Std,
		"rms":             f.RMS,
		"peak":            f.Peak,
		"peakToPeak":      f.PeakToPeak,
		"crestFactor":     f.CrestFactor,
		"kurtosis":        f.Kurtosis,
		"skewness":        f.Skewness,
		"shapeFactor":     f.ShapeFactor,
		"impulseFactor":   f.Impulse,
		"resolutionHz":    f.ResolutionHz,
	}
	if f.Bands != nil {
		out["bands"] = f.Bands
	}
	if f.Dominant != nil {
		out["dominantFrequency"] = f.Dominant.Freq
		out["dominantDamping"] = f.Dominant.Zeta
		out["dominantQ"] = f.Dominant.Q
	}
	if c.Peaks && len(f.Peaks) > 0 {
		out["peaks"] = f.Peaks
	}
	if f.VelocityRMS != nil {
		out["velocityRmsMmS"] = *f.VelocityRMS
	}
	return out, nil
}

// blockFs is the sampling rate of a block message.
func (c *vibrationConfig) blockFs(topic string, payload map[string]any) (float64, error) {
	if c.FsPath != "" {
		if raw, ok := lookupPath(topic, payload, c.FsPath); ok {
			if fs, isNumber := toNumber(raw); isNumber && fs > 0 {
				return fs, nil
			}
		}
	}
	if c.Fs > 0 {
		return c.Fs, nil
	}
	return 0, fmt.Errorf("the message has no sampling rate in %s", c.FsPath)
}

// stream adds samples to a key's buffer and returns the windows that are
// complete (each one's samples), and the state to keep.
func (c *vibrationConfig) stream(state *vibrationState, topic string, samples []float64) ([][]float64, *vibrationState) {
	next := &vibrationState{Topic: topic}
	if state != nil {
		next.Buffer = append(next.Buffer, state.Buffer...)
	}
	next.Buffer = append(next.Buffer, samples...)
	var windows [][]float64
	for len(next.Buffer) >= c.Window {
		windows = append(windows, append([]float64(nil), next.Buffer[:c.Window]...))
		next.Buffer = next.Buffer[c.Hop:]
	}
	if len(next.Buffer) > vibrationMaxBuffer {
		next.Buffer = next.Buffer[len(next.Buffer)-vibrationMaxBuffer:]
	}
	next.Buffer = append([]float64(nil), next.Buffer...)
	return windows, next
}
