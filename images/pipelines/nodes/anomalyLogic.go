package nodes

// Anomaly node logic: dsp's detectors (zscore, ewma, iqr) on one field,
// one detector per partition key.

import (
	"fmt"

	"pipelines/dsp"
)

type anomalyConfig struct {
	Field       string
	ResultField string // where the verdict goes in the payload
	Detector    dsp.AnomalyConfig
	KeyPath     string
}

func parseAnomalyConfig(settings map[string]any) (*anomalyConfig, error) {
	cfg := &anomalyConfig{
		Field:       settingString(settings, "field", "payload.value"),
		ResultField: settingString(settings, "resultField", "anomaly"),
		KeyPath:     settingString(settings, "keyPath", ""),
		Detector: dsp.AnomalyConfig{
			Method:         settingString(settings, "method", "zscore"),
			Window:         int(settingNumber(settings, "window", 0)),
			Threshold:      settingNumber(settings, "threshold", 0),
			Lambda:         settingNumber(settings, "lambda", 0),
			Warmup:         int(settingNumber(settings, "warmup", 0)),
			Adapt:          settingNumber(settings, "adapt", 0),
			LearnAnomalies: settingBool(settings, "learnAnomalies", false),
		}.WithDefaults(),
	}
	if err := cfg.Detector.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// judge reads the field and judges it. ok=false when the message has no
// number there.
func (c *anomalyConfig) judge(state *dsp.AnomalyState, topic string, payload map[string]any) (dsp.AnomalyResult, float64, *dsp.AnomalyState, bool) {
	raw, exists := lookupPath(topic, payload, c.Field)
	if !exists {
		return dsp.AnomalyResult{}, 0, state, false
	}
	x, ok := toNumber(raw)
	if !ok {
		return dsp.AnomalyResult{}, 0, state, false
	}
	next := &dsp.AnomalyState{}
	if state != nil {
		*next = *state
		next.Window = append([]float64(nil), state.Window...)
	}
	r := c.Detector.Step(next, x)
	return r, x, next, true
}

// verdict is what is added to the message.
func (c *anomalyConfig) verdict(r dsp.AnomalyResult, key string, x float64) map[string]any {
	v := map[string]any{
		"method":    r.Method,
		"ready":     r.Ready,
		"isAnomaly": r.IsAnomaly,
		"value":     x,
		"score":     nilOr(r.Score),
	}
	for name, p := range map[string]*float64{"lower": r.Lower, "upper": r.Upper, "baseline": r.Baseline, "ewma": r.EWMA} {
		if p != nil {
			v[name] = *p
		}
	}
	if r.Reason != "" {
		v["reason"] = r.Reason
	}
	if key != "" {
		v["key"] = key
	}
	if r.IsAnomaly {
		who := fieldLabel(c.Field)
		if key != "" {
			who += " (" + key + ")"
		}
		text := fmt.Sprintf("Anomaly in %s: %.4g", who, x)
		if r.Score != nil {
			text += fmt.Sprintf(", score %.2f", *r.Score)
		}
		if r.Lower != nil && r.Upper != nil {
			text += fmt.Sprintf(", expected %.4g..%.4g", *r.Lower, *r.Upper)
		}
		v["message"] = text + " (" + r.Method + ")"
	}
	return v
}

func nilOr(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}