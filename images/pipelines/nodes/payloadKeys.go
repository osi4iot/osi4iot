package nodes

// The names of the fields of a message that the platform cannot name: a key with a dot ("v.1"). The measurements
// of the sensors name a nested field with dots between levels ("battery.voltage"), so such a value can never be
// charted, nor read by the agents. The IoTDB node warns about them (once per field) when it stores the message.

import (
	"sort"
	"strconv"
	"strings"
	"sync"
)

const (
	maxDottedKeysScan  = 10 // levels
	maxDottedKeysFound = 5
	maxDottedKeysKept  = 100 // the fields already warned about, per node
)

// dottedKeys gives the paths (levels separated by " › ") of the keys with a dot in a message, sorted, at most
// maxDottedKeysFound.
func dottedKeys(payload any) []string {
	var found []string
	var walk func(v any, prefix []string, depth int)
	walk = func(v any, prefix []string, depth int) {
		if depth > maxDottedKeysScan || len(found) >= maxDottedKeysFound {
			return
		}
		switch x := v.(type) {
		case map[string]any:
			keys := make([]string, 0, len(x))
			for k := range x {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				path := append(append([]string{}, prefix...), k)
				if strings.Contains(k, ".") && len(found) < maxDottedKeysFound {
					found = append(found, strings.Join(path, " › "))
				}
				walk(x[k], path, depth+1)
			}
		case []any:
			for i, item := range x {
				if i > 63 {
					break
				}
				walk(item, append(append([]string{}, prefix...), strconv.Itoa(i)), depth+1)
			}
		}
	}
	walk(payload, nil, 0)
	return found
}

// dottedKeysWarner remembers the fields already warned about, so that a node warns once per field.
type dottedKeysWarner struct {
	mu   sync.Mutex
	seen map[string]bool
}

// fresh gives the keys not warned about yet, and remembers them.
func (w *dottedKeysWarner) fresh(keys []string) []string {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.seen == nil {
		w.seen = map[string]bool{}
	}
	var out []string
	for _, k := range keys {
		if w.seen[k] || len(w.seen) >= maxDottedKeysKept {
			continue
		}
		w.seen[k] = true
		out = append(out, k)
	}
	return out
}
