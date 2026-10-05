package docker

import (
	"context"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/swarm"
)

func TestRecoveryReadMode(t *testing.T) {
	cases := []struct {
		layout, found int
		dangerous     bool
		refused       bool
	}{
		{3, 3, false, false}, // all there: normal reads
		{5, 5, false, false},
		{3, 2, true, false}, // one missing: read quorum 1
		{5, 3, true, false}, // two missing: every object still has a copy
		{5, 2, false, true}, // three missing: some objects may be gone
		{3, 0, false, true},
	}
	for _, c := range cases {
		dangerous, err := recoveryReadMode(c.layout, c.found, 3)
		if (err != nil) != c.refused || dangerous != c.dangerous {
			t.Errorf("%d of %d: dangerous=%v err=%v", c.found, c.layout, dangerous, err)
		}
		if err != nil && !strings.Contains(err.Error(), "garage_meta_<N>") {
			t.Errorf("refusal does not say what to look for: %v", err)
		}
	}
}

func TestTempGarageMembersWithSameNumberOnTwoHosts(t *testing.T) {
	// A stale garage_meta_3 on one node, the live garage_3 on another.
	a, b := &RecoveryTarget{Name: "worker-a"}, &RecoveryTarget{Name: "worker-b"}
	tg := newTempGarage(context.Background(), []GarageVolumeHost{
		{Target: a, Instances: []int{3}},
		{Target: b, Instances: []int{3}},
	})
	if tg.members[0].name == tg.members[1].name {
		t.Fatalf("both members named %s", tg.members[0].name)
	}
}

func TestTempGarageMembersOnePerInstance(t *testing.T) {
	a, b := &RecoveryTarget{Name: "worker-a"}, &RecoveryTarget{Name: "worker-b"}
	tg := newTempGarage(context.Background(), []GarageVolumeHost{
		{Target: a, Instances: []int{1, 2}},
		{Target: b, Instances: []int{4}},
	})
	if len(tg.members) != 3 {
		t.Fatalf("%d members, want 3", len(tg.members))
	}
	names := map[string]bool{}
	for _, m := range tg.members {
		if names[m.name] {
			t.Fatalf("duplicate container name %s", m.name)
		}
		names[m.name] = true
	}
	if tg.members[2].target != b || tg.members[2].name != recoveryContainerName+"-2-4" {
		t.Fatalf("instance 4 not on worker-b: %+v", tg.members[2])
	}
}

func TestManagerHosts(t *testing.T) {
	peers := []swarm.Peer{
		{NodeID: "self", Addr: "10.0.0.5:2377"},
		{NodeID: "m1", Addr: "10.0.0.1:2377"},
		{NodeID: "m2", Addr: "10.0.0.2:2377"},
		{NodeID: "m1-dup", Addr: "10.0.0.1:2377"},
		{NodeID: "m3", Addr: ""},
	}
	got := strings.Join(managerHosts(peers, "self"), ",")
	if got != "10.0.0.1,10.0.0.2" {
		t.Fatalf("managerHosts = %s", got)
	}
}
