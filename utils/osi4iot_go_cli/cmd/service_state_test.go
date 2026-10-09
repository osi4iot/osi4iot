package cmd

import (
	"strings"
	"testing"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
)

func TestRenderServiceHealth(t *testing.T) {
	h := docker.ServiceHealth{Service: "patroni_admin", Level: docker.HealthDegraded,
		Header:   []string{"INSTANCE", "NODE", "ROLE"},
		Rows:     [][]string{{"patroni_admin1", "worker_1", "leader"}, {"patroni_admin2", "worker_2", "replica"}},
		Problems: []string{"patroni_admin2 is \"starting\", not streaming from the leader"},
		Notes:    []string{"Leader: patroni_admin1"}}
	out := renderServiceHealth(h)
	t.Log("\n" + out)
	for _, want := range []string{"PATRONI_ADMIN", "degraded", "patroni_admin2   worker_2", "✗ patroni_admin2", "· Leader"} {
		if !strings.Contains(out, want) {
			t.Fatalf("missing %q in:\n%s", want, out)
		}
	}
	if out := renderServiceHealth(docker.ServiceHealth{Service: "garage", NotUsed: true,
		Notes: []string{"external bucket"}}); !strings.Contains(out, "GARAGE — not used") {
		t.Fatalf("not used:\n%s", out)
	}
}
