package nodes

// Join node logic (pure): the latest value of several sources in one
// message.

import (
	"fmt"
	"sort"
	"time"
)

type joinSource struct {
	Key   string // value of the key path that identifies the source
	Alias string // name in the output
}

// topicResolver gives the subject of one of the digital twin's topic
// references (the topic of the messages Listen emits for it).
type topicResolver func(topicRef string) (string, error)

type joinConfig struct {
	KeyPath   string
	ValuePath string
	Sources   []joinSource
	Mode      string // "latest", "all" or "set"
	MaxAge    time.Duration
	Timeout   time.Duration // "set": emit what there is after this long
	Output    string        // "nested" or "flat"
	TimePath  string
}

type joinValue struct {
	T int64 `json:"t"` // ms
	V any   `json:"v"`
}

// joinState is the node's state: the latest value of each source.
type joinState struct {
	Values   map[string]joinValue `json:"values"`
	SetStart int64                `json:"setStart,omitempty"` // ms; "set": first value of the open set
	Topic    string               `json:"topic,omitempty"`
}

// parseJoinConfig reads the settings. A source is given by a topic
// reference of the digital twin (topicRef, resolved with resolve: the
// subject's structure stays out of the settings) or by the raw value of
// the key path (key).
func parseJoinConfig(settings map[string]any, resolve topicResolver) (*joinConfig, error) {
	cfg := &joinConfig{
		KeyPath:   settingString(settings, "keyPath", "topic"),
		ValuePath: settingString(settings, "valuePath", "payload"),
		Mode:      settingString(settings, "mode", "latest"),
		MaxAge:    time.Duration(settingNumber(settings, "maxAgeSeconds", 0) * float64(time.Second)),
		Timeout:   time.Duration(settingNumber(settings, "timeoutSeconds", 0) * float64(time.Second)),
		Output:    settingString(settings, "output", "nested"),
		TimePath:  settingString(settings, "timePath", ""),
	}
	seenKeys := map[string]bool{}
	seenAliases := map[string]bool{}
	for i, raw := range settingMaps(settings, "sources") {
		key := valueText(raw["key"])
		defaultAlias := key
		if ref := settingString(raw, "topicRef", ""); ref != "" {
			if resolve == nil {
				return nil, fmt.Errorf("source %d: topic references cannot be resolved", i+1)
			}
			if cfg.KeyPath != "topic" {
				return nil, fmt.Errorf("source %d: sources given by topic need the key path \"topic\"", i+1)
			}
			subject, err := resolve(ref)
			if err != nil {
				return nil, fmt.Errorf("source %d: %v", i+1, err)
			}
			key, defaultAlias = subject, ref
		}
		if key == "" {
			return nil, fmt.Errorf("source %d: a topic or a key is required", i+1)
		}
		alias := settingString(raw, "alias", defaultAlias)
		if seenKeys[key] {
			return nil, fmt.Errorf("source %d: key %q is repeated", i+1, key)
		}
		if seenAliases[alias] {
			return nil, fmt.Errorf("source %d: alias %q is repeated", i+1, alias)
		}
		seenKeys[key], seenAliases[alias] = true, true
		cfg.Sources = append(cfg.Sources, joinSource{Key: key, Alias: alias})
	}
	switch cfg.Mode {
	case "latest":
	case "all", "set":
		if len(cfg.Sources) == 0 {
			return nil, fmt.Errorf("mode %q needs the list of sources", cfg.Mode)
		}
	default:
		return nil, fmt.Errorf("mode must be latest, all or set")
	}
	if cfg.Output != "nested" && cfg.Output != "flat" {
		return nil, fmt.Errorf("output must be nested or flat")
	}
	if cfg.MaxAge < 0 || cfg.Timeout < 0 {
		return nil, fmt.Errorf("times cannot be negative")
	}
	return cfg, nil
}

// alias is the output name of a source key ("" if the key is not one of
// the configured sources).
func (c *joinConfig) alias(key string) string {
	if len(c.Sources) == 0 {
		return key
	}
	for _, s := range c.Sources {
		if s.Key == key {
			return s.Alias
		}
	}
	return ""
}

type joinOutcome struct {
	Emit    map[string]any
	Next    *joinState
	Ignored string
}

// add stores a message's value and says what to emit.
func (c *joinConfig) add(state *joinState, topic string, payload map[string]any, at time.Time) joinOutcome {
	key := partitionKey(topic, payload, c.KeyPath)
	alias := c.alias(key)
	if alias == "" {
		return joinOutcome{Next: state, Ignored: fmt.Sprintf("%q is not one of the sources", key)}
	}
	value, ok := lookupPath(topic, payload, c.ValuePath)
	if !ok {
		return joinOutcome{Next: state, Ignored: "the message has no " + c.ValuePath}
	}

	next := &joinState{Values: map[string]joinValue{}}
	if state != nil {
		for k, v := range state.Values {
			next.Values[k] = v
		}
		next.SetStart = state.SetStart
	}
	t := at.UnixMilli()
	next.Values[alias] = joinValue{T: t, V: cloneJSON(value)}
	next.Topic = topic
	c.dropOld(next, at)
	if c.Mode == "set" && next.SetStart == 0 {
		next.SetStart = t
	}

	switch c.Mode {
	case "latest":
		return joinOutcome{Emit: c.result(next, false), Next: next}
	case "all":
		if !c.complete(next) {
			return joinOutcome{Next: next}
		}
		return joinOutcome{Emit: c.result(next, false), Next: next}
	default: // set
		if !c.complete(next) {
			return joinOutcome{Next: next}
		}
		return joinOutcome{Emit: c.result(next, false), Next: nil}
	}
}

// closeDue emits an incomplete set whose timeout has passed.
func (c *joinConfig) closeDue(state *joinState, now time.Time) joinOutcome {
	if c.Mode != "set" || c.Timeout <= 0 || state == nil || state.SetStart == 0 {
		return joinOutcome{Next: state}
	}
	if now.Sub(time.UnixMilli(state.SetStart)) < c.Timeout {
		return joinOutcome{Next: state}
	}
	next := &joinState{Values: map[string]joinValue{}, Topic: state.Topic}
	for k, v := range state.Values {
		next.Values[k] = v
	}
	c.dropOld(next, now)
	if len(next.Values) == 0 {
		return joinOutcome{Next: nil}
	}
	return joinOutcome{Emit: c.result(next, true), Next: nil}
}

// dropOld forgets the values older than the maximum age.
func (c *joinConfig) dropOld(s *joinState, now time.Time) {
	if c.MaxAge <= 0 {
		return
	}
	limit := now.Add(-c.MaxAge).UnixMilli()
	for k, v := range s.Values {
		if v.T < limit {
			delete(s.Values, k)
		}
	}
}

func (c *joinConfig) complete(s *joinState) bool {
	for _, src := range c.Sources {
		if _, ok := s.Values[src.Alias]; !ok {
			return false
		}
	}
	return true
}

// result builds the output payload: nested by alias, or flat (the payloads
// merged, the most recent last so that it wins).
func (c *joinConfig) result(s *joinState, partial bool) map[string]any {
	out := map[string]any{}
	stamps := map[string]any{}
	aliases := make([]string, 0, len(s.Values))
	for alias := range s.Values {
		aliases = append(aliases, alias)
	}
	sort.Slice(aliases, func(i, j int) bool {
		a, b := s.Values[aliases[i]], s.Values[aliases[j]]
		if a.T != b.T {
			return a.T < b.T
		}
		return aliases[i] < aliases[j]
	})
	for _, alias := range aliases {
		v := s.Values[alias]
		stamps[alias] = isoTime(time.UnixMilli(v.T))
		if c.Output == "flat" {
			if m, ok := cloneJSON(v.V).(map[string]any); ok {
				for k, field := range m {
					out[k] = field
				}
				continue
			}
		}
		out[alias] = cloneJSON(v.V)
	}
	out["_timestamps"] = stamps
	if partial {
		missing := []string{}
		for _, src := range c.Sources {
			if _, ok := s.Values[src.Alias]; !ok {
				missing = append(missing, src.Alias)
			}
		}
		out["_missing"] = missing
	}
	return out
}
