package nodes

import (
	"strings"
	"testing"
)

func TestDottedKeys(t *testing.T) {
	payload := map[string]any{
		"temperature": 20.5,
		"v.1":         3,
		"battery":     map[string]any{"voltage": 3.7, "cell.2": 1.2},
		"sensors":     []any{map[string]any{"t": 20}, map[string]any{"t.max": 25}},
	}
	got := strings.Join(dottedKeys(payload), " | ")
	if got != "battery › cell.2 | sensors › 1 › t.max | v.1" {
		t.Errorf("%q", got)
	}
	if len(dottedKeys(map[string]any{"a": map[string]any{"b": 1}})) != 0 {
		t.Error("a message without dotted keys")
	}
	var w dottedKeysWarner
	if len(w.fresh([]string{"v.1", "x.y"})) != 2 || len(w.fresh([]string{"v.1"})) != 0 {
		t.Error("warned twice")
	}
}
