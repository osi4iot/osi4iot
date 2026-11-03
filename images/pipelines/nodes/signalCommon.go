package nodes

// Helpers shared by the signal nodes (Switch, Deadband, Window, Join). Pure
// functions (standard library only), so their logic is tested on its own.
//
// Conventions of these nodes:
//   - A field is chosen with a path: "topic", "payload", "payload.a.b" or
//     just "a.b" (read in the payload). Numeric segments index arrays.
//   - The partition key (one state per value) is a path too, "topic" by
//     default; the subject's structure is never interpreted.
//   - The time of a message is read from an optional path (ISO 8601 text,
//     or epoch in ms or s); without it, the arrival time.

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// lookupPath reads a path of a message (its topic and payload).
func lookupPath(topic string, payload map[string]any, path string) (any, bool) {
	path = strings.TrimSpace(path)
	switch {
	case path == "topic":
		return topic, topic != ""
	case path == "" || path == "payload":
		return payload, payload != nil
	case strings.HasPrefix(path, "payload."):
		path = strings.TrimPrefix(path, "payload.")
	}
	var current any = payload
	for _, segment := range strings.Split(path, ".") {
		switch node := current.(type) {
		case map[string]any:
			value, ok := node[segment]
			if !ok {
				return nil, false
			}
			current = value
		case []any:
			index, err := strconv.Atoi(segment)
			if err != nil || index < 0 || index >= len(node) {
				return nil, false
			}
			current = node[index]
		default:
			return nil, false
		}
	}
	return current, true
}

// fieldLabel is the name a path gets in a node's output: its last segment
// ("payload.data.Eps_1" → "Eps_1").
func fieldLabel(path string) string {
	path = strings.TrimPrefix(strings.TrimSpace(path), "payload.")
	if i := strings.LastIndex(path, "."); i >= 0 {
		return path[i+1:]
	}
	return path
}

// fieldLabels names several paths: by their last segment, or by the whole
// path (without "payload.") when two would share it.
func fieldLabels(paths []string) []string {
	count := map[string]int{}
	for _, p := range paths {
		count[fieldLabel(p)]++
	}
	labels := make([]string, len(paths))
	for i, p := range paths {
		label := fieldLabel(p)
		if count[label] > 1 {
			label = strings.TrimPrefix(strings.TrimSpace(p), "payload.")
		}
		labels[i] = label
	}
	return labels
}

// toNumber converts JSON numbers, Go numbers and numeric text.
func toNumber(v any) (float64, bool) {
	var f float64
	switch x := v.(type) {
	case float64:
		f = x
	case float32:
		f = float64(x)
	case int:
		f = float64(x)
	case int32:
		f = float64(x)
	case int64:
		f = float64(x)
	case uint:
		f = float64(x)
	case uint32:
		f = float64(x)
	case uint64:
		f = float64(x)
	case json.Number:
		parsed, err := x.Float64()
		if err != nil {
			return 0, false
		}
		f = parsed
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil {
			return 0, false
		}
		f = parsed
	default:
		return 0, false
	}
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0, false
	}
	return f, true
}

// valueText is the text of a value, to compare non-numeric values and to
// name partition keys.
func valueText(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case float64, float32, int, int32, int64, uint, uint32, uint64, bool, json.Number:
		return fmt.Sprint(x)
	default:
		b, err := json.Marshal(x)
		if err != nil {
			return fmt.Sprint(x)
		}
		return string(b)
	}
}

// messageTime is the time of a message: the value at timePath (ISO 8601
// text, or epoch in ms; values below 1e11 are taken as seconds), or now
// when there is none or it cannot be read.
func messageTime(topic string, payload map[string]any, timePath string, now time.Time) time.Time {
	if strings.TrimSpace(timePath) == "" {
		return now
	}
	value, ok := lookupPath(topic, payload, timePath)
	if !ok {
		return now
	}
	if text, isText := value.(string); isText {
		for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999999", "2006-01-02 15:04:05"} {
			if t, err := time.Parse(layout, strings.TrimSpace(text)); err == nil {
				return t
			}
		}
	}
	if number, isNumber := toNumber(value); isNumber && number > 0 {
		if number < 1e11 {
			return time.UnixMilli(int64(number * 1000))
		}
		return time.UnixMilli(int64(number))
	}
	return now
}

// defaultTimePath is the timestamp that the Listen node adds to every
// payload: the nodes that place messages in days read it by default.
const defaultTimePath = "payload.timestamp"

// idleClose is how long a signal must go without messages before the clock,
// and not the messages' own timestamps, closes its period (so that a replay
// of old data is not split by the clock).
const idleClose = 2 * time.Minute

// timePathSetting reads the "timePath" setting of the nodes that use the
// message timestamp by default: missing, the default path; "", arrival time.
func timePathSetting(settings map[string]any) string {
	if v, ok := settings["timePath"].(string); ok {
		return strings.TrimSpace(v)
	}
	return defaultTimePath
}

// eventTime is the time of a message: its timestamp at timePath, but never
// ahead of its arrival (a device clock ahead would close periods early).
func eventTime(topic string, payload map[string]any, timePath string, arrival time.Time) time.Time {
	t := messageTime(topic, payload, timePath, arrival)
	if t.After(arrival) {
		return arrival
	}
	return t
}

// partitionKey is the value of the key path ("" when the node has a single
// state, or the message has no such value).
func partitionKey(topic string, payload map[string]any, keyPath string) string {
	if strings.TrimSpace(keyPath) == "" {
		return ""
	}
	value, ok := lookupPath(topic, payload, keyPath)
	if !ok {
		return ""
	}
	return valueText(value)
}

// kvKeySegment turns any text into a valid NATS KV key segment.
func kvKeySegment(text string) string {
	if text == "" {
		return "_"
	}
	return base64.RawURLEncoding.EncodeToString([]byte(text))
}

// resetRequest reads "payload.reset" of a message: true resets the whole
// node, a text resets that partition key only.
func resetRequest(payload map[string]any) (reset bool, key string) {
	value, ok := payload["reset"]
	if !ok {
		return false, ""
	}
	switch x := value.(type) {
	case bool:
		return x, ""
	case string:
		if strings.TrimSpace(x) == "" {
			return false, ""
		}
		return true, x
	}
	return false, ""
}

// isoTime formats a time for the outputs (UTC, milliseconds).
func isoTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z07:00")
}

// ---- settings ----

func settingString(settings map[string]any, key, def string) string {
	if v, ok := settings[key].(string); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func settingNumber(settings map[string]any, key string, def float64) float64 {
	if v, ok := toNumber(settings[key]); ok {
		return v
	}
	return def
}

func settingBool(settings map[string]any, key string, def bool) bool {
	if v, ok := settings[key].(bool); ok {
		return v
	}
	return def
}

// settingStrings reads a list of texts (a JSON array, or comma separated
// text), without empty entries.
func settingStrings(settings map[string]any, key string) []string {
	out := []string{}
	switch v := settings[key].(type) {
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	case []string:
		for _, s := range v {
			if strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	case string:
		for _, s := range strings.Split(v, ",") {
			if strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	}
	return out
}

// settingMaps reads a list of objects.
func settingMaps(settings map[string]any, key string) []map[string]any {
	out := []map[string]any{}
	if list, ok := settings[key].([]any); ok {
		for _, item := range list {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
	}
	return out
}
