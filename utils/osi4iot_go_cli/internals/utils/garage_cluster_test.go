package utils

import (
	"crypto/ed25519"
	"encoding/hex"
	"strings"
	"testing"

	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func clusterPI(location string, roles ...string) osi_types.PlatformInfo {
	pi := osi_types.PlatformInfo{S3BucketType: S3BucketTypeGarage, S3BucketName: "osi4iot",
		DeploymentLocation: location}
	for i, role := range roles {
		pi.NodesData = append(pi.NodesData, osi_types.NodeData{
			NodeIP: "10.0.0." + string(rune('1'+i)), NodeRole: role,
			NodeHostName: "Node-" + string(rune('A'+i)),
		})
	}
	return pi
}

// perNode counts the instances on each node IP.
func perNode(pi osi_types.PlatformInfo) map[string]int {
	counts := map[string]int{}
	for _, inst := range pi.GarageInstances {
		counts[inst.NodeIP]++
	}
	return counts
}

func TestEnsureGarageInstancesPlacement(t *testing.T) {
	cases := []struct {
		name   string
		pi     osi_types.PlatformInfo
		rf     int
		counts map[string]int
	}{
		{"local", clusterPI("Local deployment", "Manager"), 1,
			map[string]int{"10.0.0.1": 1}},
		{"1 worker", clusterPI("On-premise cluster deployment", "Manager", "Platform worker"), 3,
			map[string]int{"10.0.0.2": 3}},
		{"2 workers", clusterPI("AWS cluster deployment", "Manager", "Platform worker", "Platform worker"), 3,
			map[string]int{"10.0.0.2": 2, "10.0.0.3": 1}},
		{"3 workers", clusterPI("On-premise cluster deployment", "Manager", "Platform worker", "Platform worker", "Platform worker"), 3,
			map[string]int{"10.0.0.2": 1, "10.0.0.3": 1, "10.0.0.4": 1}},
		{"4 workers", clusterPI("On-premise cluster deployment", "Manager", "Platform worker", "Platform worker", "Platform worker", "Platform worker"), 3,
			map[string]int{"10.0.0.2": 1, "10.0.0.3": 1, "10.0.0.4": 1}},
		{"managers only", clusterPI("On-premise cluster deployment", "Manager", "Manager", "Manager"), 3,
			map[string]int{"10.0.0.1": 1, "10.0.0.2": 1, "10.0.0.3": 1}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			pi := c.pi
			changed, err := EnsureGarageInstances(&pi)
			if err != nil || !changed {
				t.Fatalf("changed=%v err=%v", changed, err)
			}
			if pi.GarageReplicationFactor != c.rf {
				t.Fatalf("RF = %d, want %d", pi.GarageReplicationFactor, c.rf)
			}
			got := perNode(pi)
			if len(got) != len(c.counts) {
				t.Fatalf("placement = %v, want %v", got, c.counts)
			}
			for ip, n := range c.counts {
				if got[ip] != n {
					t.Fatalf("placement = %v, want %v", got, c.counts)
				}
			}
			// Distinct IDs and identities, IDs from 1.
			seen := map[string]bool{}
			for i, inst := range GarageInstancesSorted(pi) {
				if inst.ID != i+1 {
					t.Fatalf("IDs not 1..N: %v", pi.GarageInstances)
				}
				id := GarageNodeID(inst)
				if len(id) != 64 || seen[id] {
					t.Fatalf("bad or repeated node ID %q", id)
				}
				seen[id] = true
			}
		})
	}
}

func TestEnsureGarageInstancesIsStableAndRFFixed(t *testing.T) {
	pi := clusterPI("On-premise cluster deployment", "Manager", "Platform worker")
	EnsureGarageInstances(&pi)
	before := append([]osi_types.GarageInstance(nil), pi.GarageInstances...)

	// A worker added later changes nothing here: moving instances is the
	// rebalancer's job, not the deploy's.
	pi.NodesData = append(pi.NodesData, osi_types.NodeData{NodeIP: "10.0.0.9", NodeRole: "Platform worker"})
	if changed, _ := EnsureGarageInstances(&pi); changed {
		t.Fatal("existing instances were re-planned")
	}
	for i := range before {
		if pi.GarageInstances[i] != before[i] {
			t.Fatal("an instance changed")
		}
	}
	// Nor does a different deployment location change the RF once fixed.
	pi.DeploymentLocation = "Local deployment"
	if GarageReplicationFactor(pi) != 3 {
		t.Fatal("RF changed after creation")
	}
}

func TestNewGarageInstanceTakesLowestFreeID(t *testing.T) {
	pi := clusterPI("On-premise cluster deployment", "Manager", "Platform worker")
	EnsureGarageInstances(&pi) // 1, 2, 3

	// During a move the old instance still exists: the new one is 4.
	moved := NewGarageInstance(&pi, "10.0.0.9")
	if moved.ID != 4 {
		t.Fatalf("new ID %d during a move, want 4", moved.ID)
	}
	// The old one (3) is retired; the next move takes 3 again.
	RemoveGarageInstance(&pi, 3)
	again := NewGarageInstance(&pi, "10.0.0.8")
	if again.ID != 3 {
		t.Fatalf("new ID %d, want 3 (free again)", again.ID)
	}
	if again.NodeKey == moved.NodeKey {
		t.Fatal("a reused ID must come with a new identity")
	}
	// Lowest free, not just the first gap after the last.
	RemoveGarageInstance(&pi, 1)
	if inst := NewGarageInstance(&pi, "10.0.0.7"); inst.ID != 1 {
		t.Fatalf("new ID %d, want 1", inst.ID)
	}
}

func TestGarageNodeKeyIsLibsodiumLayout(t *testing.T) {
	inst := osi_types.GarageInstance{ID: 1, NodeKey: GenerateGarageNodeKey()}
	key, err := GarageNodeKeyBytes(inst)
	if err != nil || len(key) != 64 {
		t.Fatalf("key: %v (%d bytes)", err, len(key))
	}
	// seed || public key, and the node ID is that public key.
	pub := ed25519.NewKeyFromSeed(key[:32]).Public().(ed25519.PublicKey)
	if hex.EncodeToString(pub) != GarageNodeID(inst) || hex.EncodeToString(key[32:]) != GarageNodeID(inst) {
		t.Fatal("node ID is not the key's public half")
	}
}

func TestGarageConfigAndSpecForCluster(t *testing.T) {
	pi := clusterPI("On-premise cluster deployment", "Manager", "Platform worker", "Platform worker")
	EnsureGarageSecrets(&pi, false)
	EnsureGarageInstances(&pi)

	toml := GarageConfigToml(pi)
	if !strings.Contains(toml, "replication_factor = 3") {
		t.Fatal("cluster config is not RF=3")
	}
	for _, inst := range pi.GarageInstances {
		peer := GarageNodeID(inst) + "@garage_" + string(rune('0'+inst.ID)) + ":3901"
		if !strings.Contains(toml, `"`+peer+`"`) {
			t.Fatalf("bootstrap_peers lacks %s", peer)
		}
	}

	spec := GarageProvisionSpec(pi)
	nodes := 0
	for _, line := range strings.Split(spec, "\n") {
		if f := strings.Fields(line); len(f) > 0 && f[0] == "node" {
			nodes++
			if len(f) != 4 || f[3] != "1000000000000" {
				t.Fatalf("bad node line %q", line)
			}
		}
	}
	if nodes != 3 {
		t.Fatalf("%d node lines, want 3", nodes)
	}
	// Two instances share node-b's zone, one is in node-c's.
	if strings.Count(spec, " node-b ") != 2 || strings.Count(spec, " node-c ") != 1 {
		t.Fatalf("zones:\n%s", spec)
	}

	local := clusterPI("Local deployment", "Manager")
	EnsureGarageInstances(&local)
	if !strings.Contains(GarageConfigToml(local), "replication_factor = 1") {
		t.Fatal("local config is not RF=1")
	}
}

func TestGarageInstanceIDFromService(t *testing.T) {
	for name, want := range map[string]bool{"garage_1": true, "garage_12": true,
		"garage": false, "garage_webui": false, "garage_1x": false} {
		if _, ok := GarageInstanceIDFromService(name); ok != want {
			t.Errorf("%s: %v", name, ok)
		}
	}
}

// apply simulates the moves on the state, returning the counts per node.
func applyMoves(pi osi_types.PlatformInfo, moves []osi_types.GarageMove) map[string]int {
	for _, m := range moves {
		for i := range pi.GarageInstances {
			if pi.GarageInstances[i].ID == m.OldID {
				pi.GarageInstances[i].NodeIP = m.ToIP
			}
		}
	}
	return perNode(pi)
}

func TestPlanGarageRebalance(t *testing.T) {
	inst := func(id int, ip string) osi_types.GarageInstance {
		return osi_types.GarageInstance{ID: id, NodeIP: ip}
	}
	cases := []struct {
		name      string
		instances []osi_types.GarageInstance
		hosts     []string
		moves     int
		want      map[string]int
		firstOld  int
	}{
		{"1 -> 2 workers", []osi_types.GarageInstance{inst(1, "A"), inst(2, "A"), inst(3, "A")},
			[]string{"A", "B"}, 1, map[string]int{"A": 2, "B": 1}, 3},
		{"2 -> 3 workers", []osi_types.GarageInstance{inst(1, "A"), inst(2, "A"), inst(3, "B")},
			[]string{"A", "B", "C"}, 1, map[string]int{"A": 1, "B": 1, "C": 1}, 2},
		{"1 -> 3 workers", []osi_types.GarageInstance{inst(1, "A"), inst(2, "A"), inst(3, "A")},
			[]string{"A", "B", "C"}, 2, map[string]int{"A": 1, "B": 1, "C": 1}, 3},
		{"balanced: nothing to do", []osi_types.GarageInstance{inst(1, "A"), inst(2, "B"), inst(3, "C")},
			[]string{"A", "B", "C"}, 0, map[string]int{"A": 1, "B": 1, "C": 1}, 0},
		{"2 workers already 2+1 with B first", []osi_types.GarageInstance{inst(1, "B"), inst(2, "B"), inst(3, "A")},
			[]string{"A", "B"}, 0, map[string]int{"A": 1, "B": 2}, 0},
		{"remove C (evacuate)", []osi_types.GarageInstance{inst(1, "A"), inst(2, "B"), inst(3, "C")},
			[]string{"A", "B"}, 1, map[string]int{"A": 2, "B": 1}, 3},
		{"remove B from 2+1", []osi_types.GarageInstance{inst(1, "A"), inst(2, "A"), inst(3, "B")},
			[]string{"A"}, 1, map[string]int{"A": 3}, 3},
		{"4th worker: 3 stay put", []osi_types.GarageInstance{inst(1, "A"), inst(2, "B"), inst(3, "C")},
			[]string{"A", "B", "C", "D"}, 0, map[string]int{"A": 1, "B": 1, "C": 1}, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			pi := osi_types.PlatformInfo{GarageInstances: c.instances}
			moves := PlanGarageRebalance(pi, c.hosts)
			if len(moves) != c.moves {
				t.Fatalf("%d moves %v, want %d", len(moves), moves, c.moves)
			}
			if c.moves > 0 && moves[0].OldID != c.firstOld {
				t.Fatalf("first move %v, want instance %d to leave", moves[0], c.firstOld)
			}
			got := applyMoves(pi, moves)
			for ip, n := range c.want {
				if got[ip] != n {
					t.Fatalf("after moves %v, want %v", got, c.want)
				}
			}
			for ip := range got {
				if _, ok := c.want[ip]; !ok {
					t.Fatalf("instances left on %s: %v", ip, got)
				}
			}
		})
	}
}

func TestPlanGarageScale(t *testing.T) {
	inst := func(id int, ip string) osi_types.GarageInstance {
		return osi_types.GarageInstance{ID: id, NodeIP: ip}
	}
	five := []string{"A", "B", "C", "D", "E"}
	cluster := func(instances ...osi_types.GarageInstance) osi_types.PlatformInfo {
		return osi_types.PlatformInfo{GarageReplicationFactor: 3, GarageInstances: instances}
	}

	t.Run("5 -> 3 removes two, one per step", func(t *testing.T) {
		pi := cluster(inst(1, "A"), inst(2, "B"), inst(3, "C"), inst(4, "D"), inst(5, "E"))
		moves := PlanGarageScale(pi, five, 3)
		if len(moves) != 2 || moves[0].OldID != 5 || moves[1].OldID != 4 ||
			moves[0].ToIP != "" || moves[1].ToIP != "" {
			t.Fatalf("moves %v, want remove 5 then remove 4", moves)
		}
	})
	t.Run("3 -> 5 adds on the empty hosts", func(t *testing.T) {
		pi := cluster(inst(1, "A"), inst(2, "B"), inst(3, "C"))
		moves := PlanGarageScale(pi, five, 5)
		if len(moves) != 2 || moves[0].ToIP != "D" || moves[1].ToIP != "E" || moves[0].OldID != 0 {
			t.Fatalf("moves %v, want add on D then E", moves)
		}
	})
	t.Run("shrinking drops instances on non-hosts first", func(t *testing.T) {
		// D is being drained away: its instance goes even though E has a higher ID.
		pi := cluster(inst(1, "A"), inst(2, "B"), inst(3, "C"), inst(4, "D"), inst(5, "E"))
		moves := PlanGarageScale(pi, []string{"A", "B", "C", "E"}, 4)
		if len(moves) != 1 || moves[0].OldID != 4 {
			t.Fatalf("moves %v, want remove 4", moves)
		}
	})
	t.Run("same count: nothing", func(t *testing.T) {
		pi := cluster(inst(1, "A"), inst(2, "B"), inst(3, "C"))
		if moves := PlanGarageScale(pi, five, 3); len(moves) != 0 {
			t.Fatalf("moves %v", moves)
		}
	})
}

func TestCheckGarageScale(t *testing.T) {
	cluster := osi_types.PlatformInfo{GarageReplicationFactor: 3}
	five := []string{"A", "B", "C", "D", "E"}
	ok := []int{3, 4, 5}
	for _, n := range ok {
		if err := CheckGarageScale(cluster, five, n); err != nil {
			t.Errorf("%d refused: %v", n, err)
		}
	}
	for _, n := range []int{1, 2, 6} {
		if err := CheckGarageScale(cluster, five, n); err == nil {
			t.Errorf("%d accepted with 5 workers", n)
		}
	}
	// 1 or 2 workers: exactly 3.
	if CheckGarageScale(cluster, []string{"A", "B"}, 3) != nil || CheckGarageScale(cluster, []string{"A", "B"}, 4) == nil {
		t.Error("2 workers must allow exactly 3")
	}
	local := osi_types.PlatformInfo{GarageReplicationFactor: 1}
	if CheckGarageScale(local, []string{"A"}, 1) == nil {
		t.Error("a local deployment cannot be scaled")
	}
}


