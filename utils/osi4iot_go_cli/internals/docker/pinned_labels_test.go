package docker

import (
	"fmt"
	"strings"
	"testing"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// pinnedPlatform: workers w1..wN (IP = name) labelled positionally, as
// the old scheme and a fresh deployment both leave them, plus a manager.
func pinnedPlatform(workers, nats, patroni int) (*pt.PlatformData, map[string]map[string]string) {
	pd := &pt.PlatformData{}
	pi := &pd.PlatformInfo
	pi.DeploymentLocation = "AWS cluster deployment"
	pi.UsePatroniTool = true
	pi.NumPatroniAdminNodes, pi.NumPatroniMetricsNodes = patroni, patroni
	pi.ServicesData = []pt.ServiceData{{ServiceName: "nats", Replicas: nats}}
	pi.NodesData = []pt.NodeData{{NodeIP: "m1", NodeRole: "Manager"}}
	labels := map[string]map[string]string{"m1": {}}
	for i := 1; i <= workers; i++ {
		ip := fmt.Sprintf("w%d", i)
		pi.NodesData = append(pi.NodesData, pt.NodeData{NodeIP: ip, NodeRole: "Platform worker", NodeLabel: "worker_" + ip[1:]})
		labels[ip] = map[string]string{"platform_worker": "true", fmt.Sprintf("nats_%d", i): "true",
			"admin-id": fmt.Sprint(i), "metrics-id": fmt.Sprint(i)}
	}
	return pd, labels
}

func TestAssignPinnedIDsKeepsNumbers(t *testing.T) {
	// w2 (number 2) removed: w1 and w3 keep theirs, w4 (number 4, now out
	// of range) takes the freed 2.
	got := assignPinnedIDs([]string{"w1", "w3", "w4"},
		map[string][]int{"w1": {1}, "w3": {3}, "w4": {4}})
	if got["w1"] != 1 || got["w3"] != 3 || got["w4"] != 2 {
		t.Fatalf("%v", got)
	}
	// Fresh platform: positional.
	got = assignPinnedIDs([]string{"a", "b", "c"}, map[string][]int{})
	if got["a"] != 1 || got["b"] != 2 || got["c"] != 3 {
		t.Fatalf("%v", got)
	}
	// A duplicate keeps its first holder; a new worker gets the next free.
	got = assignPinnedIDs([]string{"a", "b", "c"}, map[string][]int{"a": {2}, "b": {2}})
	if got["a"] != 2 || got["b"] != 1 || got["c"] != 3 {
		t.Fatalf("%v", got)
	}
}

func TestRemovingFirstWorkerMovesOnlyItsInstances(t *testing.T) {
	// The case that wiped everything: 4 workers, 3 replicas, remove w1.
	// Positional numbering moved all three instances of every service.
	pd, labels := pinnedPlatform(4, 3, 3)
	impact := PlanNodeRemoval(pd, pd.PlatformInfo.NodesData[1], labels)
	var moved []string
	for _, m := range impact.Moves {
		moved = append(moved, m.Instance+"->"+m.To)
	}
	want := "nats1->worker_4,patroni_admin1->worker_4,patroni_metrics1->worker_4"
	if strings.Join(moved, ",") != want {
		t.Fatalf("moves %v, want %s", moved, want)
	}
	if len(impact.HomelessServices) != 0 || len(impact.SingleCopies) != 0 {
		t.Fatalf("%+v", impact)
	}
}

func TestRemovingSpareWorkerMovesNothing(t *testing.T) {
	pd, labels := pinnedPlatform(4, 3, 3)
	impact := PlanNodeRemoval(pd, pd.PlatformInfo.NodesData[4], labels) // w4: number 4, no instance
	if len(impact.Moves) != 0 || len(impact.HomelessServices) != 0 {
		t.Fatalf("%+v", impact)
	}
}

func TestRemovalLeavingTooFewWorkers(t *testing.T) {
	pd, labels := pinnedPlatform(3, 3, 3)
	impact := PlanNodeRemoval(pd, pd.PlatformInfo.NodesData[2], labels)
	if got := strings.Join(impact.HomelessServices, ","); got != "nats3,patroni_admin3,patroni_metrics3" {
		t.Fatalf("homeless %q", got)
	}
}

func TestRemovalOfSingleCopies(t *testing.T) {
	pd, labels := pinnedPlatform(2, 1, 1)
	impact := PlanNodeRemoval(pd, pd.PlatformInfo.NodesData[1], labels) // w1 holds the only copies
	if got := strings.Join(impact.SingleCopies, ","); got != "nats1,patroni_admin1,patroni_metrics1" {
		t.Fatalf("single copies %q", got)
	}
	impact = PlanNodeRemoval(pd, pd.PlatformInfo.NodesData[2], labels) // w2 holds none
	if len(impact.SingleCopies) != 0 || len(impact.Moves) != 0 {
		t.Fatalf("%+v", impact)
	}
}

func TestDescribeRemovalListsMoves(t *testing.T) {
	pd, labels := pinnedPlatform(4, 3, 3)
	target := pd.PlatformInfo.NodesData[2]
	out := DescribeRemoval(PlanNodeRemoval(pd, target, labels), target)
	if !strings.Contains(out, "nats2 moves to worker_4 and rebuilds its data there") {
		t.Fatalf("%s", out)
	}
}

func TestDescribeRemovalSingleCopy(t *testing.T) {
	pd, labels := pinnedPlatform(2, 1, 1)
	target := pd.PlatformInfo.NodesData[1]
	out := DescribeRemoval(PlanNodeRemoval(pd, target, labels), target)
	if !strings.Contains(out, "patroni_admin1 moves to worker_2 and starts there EMPTY") {
		t.Fatalf("%s", out)
	}
}
