package data

import (
	"errors"
	"strings"
	"testing"
)

func running(names ...string) []serviceObservation {
	var out []serviceObservation
	for _, n := range names {
		out = append(out, serviceObservation{Name: n, Required: 1, Running: 1})
	}
	return out
}

func TestClassifyPlatform(t *testing.T) {
	cases := []struct {
		name   string
		obs    platformObservation
		want   PlatformStatus
		detail string
	}{
		{"everything running", platformObservation{SwarmActive: true,
			Services: running("admin_api", "garage_1", "garage_3", "garage_4")}, Running, ""},
		{"a global service on every node", platformObservation{SwarmActive: true,
			Services: []serviceObservation{{Name: "vector", Required: 4, Running: 4}}}, Running, ""},
		{"a task still starting or failing", platformObservation{SwarmActive: true,
			Services: append(running("admin_api"), serviceObservation{Name: "garage_4", Required: 1, Running: 0})},
			Degraded, "garage_4 (0/1)"},
		{"no services, volumes kept", platformObservation{SwarmActive: true, Volumes: 12}, Stopped, ""},
		{"no services, no volumes", platformObservation{SwarmActive: true}, Deleted, ""},
		{"no swarm", platformObservation{SwarmActive: false}, Deleted, ""},
		{"no manager reachable", platformObservation{ManagerErr: errors.New("ssh: timeout")}, Unknown, ""},
		{"services could not be listed", platformObservation{SwarmActive: true,
			ServicesErr: errors.New("boom")}, Unknown, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, reason, detail := classifyPlatform(c.obs)
			if got != c.want {
				t.Fatalf("state %v, want %v", got, c.want)
			}
			if got == Unknown && reason == "" {
				t.Fatal("Unknown without a reason")
			}
			if c.detail != "" && strings.Join(detail, ",") != c.detail {
				t.Fatalf("detail %v, want %s", detail, c.detail)
			}
		})
	}
}

// The case that started this: a platform whose services all run, on a
// swarm where some node is down. Nodes do not enter the decision at all
// any more, so it can only be Running.
func TestRunningPlatformWithANodeDownIsNotDeleted(t *testing.T) {
	obs := platformObservation{SwarmActive: true, Services: running("admin_api", "garage_1")}
	if got, _, _ := classifyPlatform(obs); got != Running {
		t.Fatalf("state %v", got)
	}
}
