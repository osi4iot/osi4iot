package cmd

import (
	"strings"
	"testing"
)

func worker(name string, available bool, id string) drainNode {
	return drainNode{name: name, available: available,
		tags: []string{"admin-id=" + id, "garage_" + id, "metrics-id=" + id, "nats_" + id, "platform_worker"}}
}

func TestPinnedDrainWarnsForNatsAndPatroni(t *testing.T) {
	warnings, blocker := pinnedDrainImpact(worker("w3", true, "3"),
		[]drainNode{worker("w1", true, "1"), worker("w2", true, "2")})
	if blocker != "" {
		t.Fatalf("blocked: %s", blocker)
	}
	all := strings.Join(warnings, "\n")
	for _, want := range []string{"runs nats3", "NATS keeps working with 2 of 3", "runs patroni_admin3",
		"runs patroni_metrics3", "failover"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in\n%s", want, all)
		}
	}
	if len(warnings) != 3 {
		t.Fatalf("%d warnings: %v", len(warnings), warnings)
	}
}

func TestPinnedDrainRefusedWhenQuorumLost(t *testing.T) {
	_, blocker := pinnedDrainImpact(worker("w3", true, "3"),
		[]drainNode{worker("w1", true, "1"), worker("w2", false, "2")})
	for _, want := range []string{"Cannot drain w3", "nats3", "patroni_admin3", "patroni_metrics3",
		"keep 1 of 3", "node activate w2"} {
		if !strings.Contains(blocker, want) {
			t.Fatalf("missing %q in\n%s", want, blocker)
		}
	}
}

func TestPinnedDrainTwoPatroniNodesCannotLoseOne(t *testing.T) {
	_, blocker := pinnedDrainImpact(drainNode{name: "w2", available: true, tags: []string{"admin-id=2"}},
		[]drainNode{{name: "w1", available: true, tags: []string{"admin-id=1"}}})
	if !strings.Contains(blocker, "scale it up first") {
		t.Fatalf("blocker %q", blocker)
	}
}

func TestPinnedDrainOnlyInstance(t *testing.T) {
	warnings, blocker := pinnedDrainImpact(drainNode{name: "w1", available: true, tags: []string{"nats_1"}}, nil)
	if blocker != "" || len(warnings) != 1 || !strings.Contains(warnings[0], "the only NATS instance") {
		t.Fatalf("warnings %v blocker %q", warnings, blocker)
	}
	if w, b := pinnedDrainImpact(drainNode{name: "m1", tags: []string{"KEEPALIVED_PRIORITY=0"}}, nil); len(w)+len(b) != 0 {
		t.Fatalf("node without pinned services: %v %q", w, b)
	}
}
