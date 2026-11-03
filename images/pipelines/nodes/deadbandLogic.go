package nodes

// Deadband node logic (pure): report by exception.

import (
	"encoding/json"
	"fmt"
	"math"
	"time"
)

type deadbandConfig struct {
	Fields      []string
	BandType    string  // "absolute" or "percent"
	Band        float64 // >= 0; 0: any change
	MaxInterval time.Duration
	KeyPath     string
	TimePath    string
}

// deadbandState is the state of one partition key: the values last let
// through and when.
type deadbandState struct {
	Last   map[string]any `json:"last"`
	SentAt int64          `json:"sentAt"` // ms
}

func parseDeadbandConfig(settings map[string]any) (*deadbandConfig, error) {
	cfg := &deadbandConfig{
		Fields:      settingStrings(settings, "fields"),
		BandType:    settingString(settings, "bandType", "absolute"),
		Band:        settingNumber(settings, "band", 0),
		MaxInterval: time.Duration(settingNumber(settings, "maxIntervalSeconds", 0) * float64(time.Second)),
		KeyPath:     settingString(settings, "keyPath", ""),
		TimePath:    settingString(settings, "timePath", ""),
	}
	if len(cfg.Fields) == 0 {
		cfg.Fields = []string{"payload"}
	}
	if cfg.BandType != "absolute" && cfg.BandType != "percent" {
		return nil, fmt.Errorf("bandType must be absolute or percent")
	}
	if cfg.Band < 0 {
		return nil, fmt.Errorf("the band cannot be negative")
	}
	if cfg.MaxInterval < 0 {
		return nil, fmt.Errorf("the maximum interval cannot be negative")
	}
	return cfg, nil
}

// changed says whether a field changed enough since the value last sent.
func (c *deadbandConfig) changed(last, current any) bool {
	a, okA := toNumber(last)
	b, okB := toNumber(current)
	if !okA || !okB {
		return valueText(last) != valueText(current)
	}
	diff := math.Abs(b - a)
	band := c.Band
	if c.BandType == "percent" {
		if a == 0 {
			return b != 0
		}
		band = math.Abs(a) * c.Band / 100
	}
	if band == 0 {
		return diff > 0
	}
	return diff >= band
}

// decide says whether a message passes, given the state of its key (nil if
// none), and returns the state to store.
func (c *deadbandConfig) decide(state *deadbandState, topic string, payload map[string]any, at time.Time) (bool, *deadbandState) {
	current := map[string]any{}
	for _, path := range c.Fields {
		if value, ok := lookupPath(topic, payload, path); ok {
			current[path] = cloneJSON(value)
		}
	}

	pass := state == nil
	if !pass && c.MaxInterval > 0 && at.Sub(time.UnixMilli(state.SentAt)) >= c.MaxInterval {
		pass = true
	}
	if !pass {
		for path, value := range current {
			last, seen := state.Last[path]
			if !seen || c.changed(last, value) {
				pass = true
				break
			}
		}
	}
	if !pass {
		return false, state
	}

	next := &deadbandState{Last: map[string]any{}, SentAt: at.UnixMilli()}
	if state != nil {
		for path, value := range state.Last {
			next.Last[path] = value
		}
	}
	for path, value := range current {
		next.Last[path] = value
	}
	return true, next
}

// cloneJSON copies a value through JSON, so that the stored state does not
// share maps with the message that goes on.
func cloneJSON(v any) any {
	switch v.(type) {
	case map[string]any, []any:
		b, err := json.Marshal(v)
		if err != nil {
			return v
		}
		var out any
		if json.Unmarshal(b, &out) == nil {
			return out
		}
	}
	return v
}
