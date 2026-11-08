package nodes

// The payload shown by "Debug ON" in the pipeline logs. A message can carry
// what does not fit in a log line: an MlModel node's input tensor
// (payload.mlmInput: 1x3x640x640 = 1.2 million numbers, more than 10 MB of
// JSON) is far above the 1 MB of a NATS message, so the log was never
// published and the node's debug showed nothing. Long lists become a
// summary (their type, length, first values and, for numbers, min and max),
// long texts are cut and bytes are counted, so that the log always arrives.

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"sort"
)

const (
	// the largest debug log published (the NATS limit is 1 MB)
	maxDebugBytes = 256 * 1024
	debugMaxDepth = 8
)

type debugLimits struct {
	items int // a longer list is summarised
	text  int // a longer text is cut
}

var debugLimitSteps = []debugLimits{{items: 64, text: 4000}, {items: 8, text: 300}}

// debugPayload is the payload to show: compacted until it fits.
func debugPayload(payload map[string]any) map[string]any {
	if payload == nil {
		return nil
	}
	var size int
	for _, lim := range debugLimitSteps {
		out, _ := compactDebugValue(payload, lim, 0).(map[string]any)
		b, err := json.Marshal(out)
		if err == nil && len(b) <= maxDebugBytes {
			return out
		}
		size = len(b)
	}
	keys := make([]string, 0, len(payload))
	for k := range payload {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return map[string]any{
		"_debug": fmt.Sprintf("payload too large to show (%d bytes even summarised)", size),
		"keys":   keys,
	}
}

func compactDebugValue(v any, lim debugLimits, depth int) any {
	if v == nil {
		return nil
	}
	switch x := v.(type) {
	case string:
		r := []rune(x)
		if len(r) > lim.text {
			return string(r[:lim.text]) + fmt.Sprintf("… (%d characters)", len(r))
		}
		return x
	case []byte:
		return map[string]any{"_type": "bytes", "length": len(x)}
	case json.RawMessage:
		if len(x) > lim.text {
			return map[string]any{"_type": "json", "length": len(x)}
		}
		return x
	case bool, int, int8, int16, int32, int64, uint, uint16, uint32, uint64:
		return x
	case float64:
		return finiteOrText(x)
	case float32:
		return finiteOrText(float64(x))
	}
	if depth >= debugMaxDepth {
		return fmt.Sprintf("(%T)", v)
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Pointer, reflect.Interface:
		if rv.IsNil() {
			return nil
		}
		return compactDebugValue(rv.Elem().Interface(), lim, depth+1)
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return v
		}
		out := make(map[string]any, rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			out[iter.Key().String()] = compactDebugValue(iter.Value().Interface(), lim, depth+1)
		}
		return out
	case reflect.Slice, reflect.Array:
		n := rv.Len()
		if n > lim.items {
			return summariseDebugList(rv, n, depth)
		}
		out := make([]any, n)
		for i := 0; i < n; i++ {
			out[i] = compactDebugValue(rv.Index(i).Interface(), lim, depth+1)
		}
		return out
	}
	return v
}

func finiteOrText(f float64) any {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return fmt.Sprint(f) // JSON has no NaN nor Inf
	}
	return f
}

// summariseDebugList: type, length, the first values and, for numbers, min and max (the first values with
// their own small limits: a summary stays short whatever the limits of the rest of the payload)
func summariseDebugList(rv reflect.Value, n int, depth int) map[string]any {
	firstN := 8
	if firstN > n {
		firstN = n
	}
	first := make([]any, firstN)
	for i := 0; i < firstN; i++ {
		first[i] = compactDebugValue(rv.Index(i).Interface(), debugLimits{items: 4, text: 80}, depth+1)
	}
	out := map[string]any{
		"_type":  fmt.Sprintf("%s[%d]", rv.Type().Elem().String(), n),
		"length": n,
		"first":  first,
	}
	if min, max, ok := numericRange(rv, n); ok {
		out["min"], out["max"] = finiteOrText(min), finiteOrText(max)
	}
	return out
}

func numericRange(rv reflect.Value, n int) (float64, float64, bool) {
	min, max := math.Inf(1), math.Inf(-1)
	for i := 0; i < n; i++ {
		e := rv.Index(i)
		if e.Kind() == reflect.Interface {
			e = e.Elem()
		}
		var f float64
		switch e.Kind() {
		case reflect.Float32, reflect.Float64:
			f = e.Float()
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			f = float64(e.Int())
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			f = float64(e.Uint())
		default:
			return 0, 0, false
		}
		if math.IsNaN(f) {
			continue
		}
		min, max = math.Min(min, f), math.Max(max, f)
	}
	return min, max, !math.IsInf(min, 1)
}