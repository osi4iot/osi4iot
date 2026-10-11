package cmd

import (
	"strings"
	"testing"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
)

func TestStateBlocker(t *testing.T) {
	allowed := map[string][]data.PlatformStatus{
		"create": {data.Empty, data.Deleted},
		"init":   {data.Deleted, data.Stopped},
		"run":    {data.Stopped, data.Degraded},
		"stop":   {data.Running, data.Degraded},
		"delete": {data.Running, data.Degraded, data.Stopped},
	}
	states := []data.PlatformStatus{data.Empty, data.Unknown, data.Deleted, data.Stopped, data.Degraded, data.Running}
	for action, ok := range allowed {
		for _, state := range states {
			want := false
			for _, s := range ok {
				if s == state {
					want = true
				}
			}
			msg := stateBlocker(action, state, "no manager", []string{"garage_4 (0/1)"})
			if (msg == "") != want {
				t.Errorf("%s in state %v: allowed=%v, want %v (%q)", action, state, msg == "", want, msg)
			}
		}
	}
}

func TestStateBlockerMessages(t *testing.T) {
	if msg := stateBlocker("delete", data.Unknown, "ssh: timeout", nil); !strings.Contains(msg, "ssh: timeout") {
		t.Fatalf("Unknown does not say why: %q", msg)
	}
	if msg := stateBlocker("init", data.Degraded, "", []string{"garage_4 (0/1)"}); !strings.Contains(msg, "garage_4 (0/1)") {
		t.Fatalf("Degraded does not name the services: %q", msg)
	}
	// The bug reported: delete on a working platform.
	if msg := stateBlocker("delete", data.Running, "", nil); msg != "" {
		t.Fatalf("delete refused on a running platform: %q", msg)
	}
}
