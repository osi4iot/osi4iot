package docker

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// up is a running instance whose container can be reached (a fake ID is
// enough: evaluate* never execs).
func up(service, ip string) swarmInstance {
	return swarmInstance{Service: service, Exists: true, NodeIP: ip, Task: "running", Health: "healthy", containerID: "c-" + service}
}

func stopped(service string) swarmInstance {
	return swarmInstance{Service: service, Exists: true, Task: "pending", TaskErr: "no suitable node"}
}

func healthPD() *pt.PlatformData {
	pd := &pt.PlatformData{}
	pd.PlatformInfo.NodesData = []pt.NodeData{{NodeIP: "10.0.0.1", NodeLabel: "worker_1"}}
	return pd
}

func hasProblem(h ServiceHealth, substr string) bool {
	for _, p := range h.Problems {
		if strings.Contains(p, substr) {
			return true
		}
	}
	return false
}

// ── NATS ──

func natsView(name string, leader string, peers int, current bool) natsInstanceView {
	v := natsInstanceView{si: up(name, "10.0.0.1"), healthz: "ok", serverName: name, peers: peers, metaLeader: leader, version: "2.11.1"}
	for _, other := range []string{"nats1", "nats2", "nats3"} {
		if other != name {
			v.metaPeers = append(v.metaPeers, natsMetaPeer{Name: other, Current: current})
		}
	}
	return v
}

func TestNatsHealthy(t *testing.T) {
	h := ServiceHealth{}
	views := []natsInstanceView{natsView("nats1", "nats2", 2, true), natsView("nats2", "nats2", 2, true), natsView("nats3", "nats2", 2, true)}
	streams := []NatsStreamInfo{{Name: "A", Replicas: 3, Leader: "nats1", Peers: 3, AllCurrent: true}}
	evaluateNats(&h, healthPD(), views, streams, nil)
	if h.Level != HealthOK {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
	if h.Rows[1][5] != "meta leader" || h.Rows[0][1] != "worker_1" {
		t.Fatalf("rows %v", h.Rows)
	}
}

func TestNatsOneServerDownIsDegraded(t *testing.T) {
	h := ServiceHealth{}
	views := []natsInstanceView{natsView("nats1", "nats1", 1, false), natsView("nats2", "nats1", 1, true),
		{si: stopped("nats3")}}
	views[0].metaPeers = []natsMetaPeer{{Name: "nats2", Current: true}, {Name: "nats3", Offline: true}}
	evaluateNats(&h, healthPD(), views, nil, nil)
	if h.Level != HealthDegraded || !hasProblem(h, "nats3 is not running") || !hasProblem(h, "nats3 is offline") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestNatsNoMetaLeaderIsDown(t *testing.T) {
	h := ServiceHealth{}
	views := []natsInstanceView{natsView("nats1", "", 0, false), {si: stopped("nats2")}, {si: stopped("nats3")}}
	evaluateNats(&h, healthPD(), views, nil, nil)
	if h.Level != HealthDown || !hasProblem(h, "no meta leader") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestNatsStreamWithoutLeaderIsDown(t *testing.T) {
	h := ServiceHealth{}
	views := []natsInstanceView{natsView("nats1", "nats1", 2, true), natsView("nats2", "nats1", 2, true), natsView("nats3", "nats1", 2, true)}
	streams := []NatsStreamInfo{{Name: "A", Replicas: 3, Peers: 3}, {Name: "B", Replicas: 3, Leader: "nats2", Peers: 3}}
	evaluateNats(&h, healthPD(), views, streams, nil)
	if h.Level != HealthDown || !hasProblem(h, "without a leader") || !hasProblem(h, "B") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestNatsStandalone(t *testing.T) {
	h := ServiceHealth{}
	v := natsInstanceView{si: up("nats1", "10.0.0.1"), healthz: "ok", serverName: "nats1"}
	evaluateNats(&h, healthPD(), []natsInstanceView{v}, []NatsStreamInfo{{Name: "A", Replicas: 1, Peers: 1, AllCurrent: true}}, nil)
	if h.Level != HealthOK || h.Rows[0][5] != "standalone" {
		t.Fatalf("level %v problems %v rows %v", h.Level, h.Problems, h.Rows)
	}
}

// ── Patroni ──

func member(name, role, state string, tl int64, lag any) patroniClusterMember {
	m := patroniClusterMember{Name: name, Role: role, State: state, Timeline: tl}
	if lag != nil {
		m.Lag, _ = json.Marshal(lag)
	}
	return m
}

var okHaproxy = haproxyView{running: 2, desired: 2}

func TestPatroniHealthy(t *testing.T) {
	h := ServiceHealth{}
	inst := []swarmInstance{up("patroni_admin1", "10.0.0.1"), up("patroni_admin2", "10.0.0.2"), up("patroni_admin3", "10.0.0.3")}
	c := &patroniCluster{Members: []patroniClusterMember{
		member("patroni_admin1", "leader", "running", 4, nil),
		member("patroni_admin2", "replica", "streaming", 4, 0),
		member("patroni_admin3", "sync_standby", "streaming", 4, 1024)}}
	evaluatePatroni(&h, healthPD(), inst, c, nil, okHaproxy)
	if h.Level != HealthOK {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
	if h.Rows[2][6] != "1.0 KiB" || h.Rows[0][6] != "-" {
		t.Fatalf("rows %v", h.Rows)
	}
}

func TestPatroniLaggingAndUnknownReplicasAreDegraded(t *testing.T) {
	h := ServiceHealth{}
	inst := []swarmInstance{up("patroni_admin1", ""), up("patroni_admin2", ""), up("patroni_admin3", "")}
	c := &patroniCluster{Members: []patroniClusterMember{
		member("patroni_admin1", "leader", "running", 4, nil),
		member("patroni_admin2", "replica", "streaming", 4, 5<<20),
		member("patroni_admin3", "replica", "streaming", 4, "unknown")}}
	evaluatePatroni(&h, healthPD(), inst, c, nil, okHaproxy)
	if h.Level != HealthDegraded || !hasProblem(h, "maximum_lag_on_failover") || !hasProblem(h, "lag behind the leader is unknown") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestPatroniNoLeaderIsDown(t *testing.T) {
	h := ServiceHealth{}
	inst := []swarmInstance{up("patroni_metrics1", ""), stopped("patroni_metrics2")}
	c := &patroniCluster{Members: []patroniClusterMember{member("patroni_metrics1", "replica", "running", 2, "unknown")}}
	evaluatePatroni(&h, healthPD(), inst, c, nil, okHaproxy)
	if h.Level != HealthDown || !hasProblem(h, "no leader") || !hasProblem(h, "patroni_metrics2 is not running") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestPatroniNothingAnswersIsDown(t *testing.T) {
	h := ServiceHealth{}
	inst := []swarmInstance{up("patroni_admin1", "")}
	evaluatePatroni(&h, healthPD(), inst, nil, []string{"patroni_admin1: connection refused"}, okHaproxy)
	if h.Level != HealthDown || !hasProblem(h, "connection refused") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestPatroniHaproxyDownIsDown(t *testing.T) {
	h := ServiceHealth{}
	inst := []swarmInstance{up("patroni_admin1", "")}
	c := &patroniCluster{Members: []patroniClusterMember{member("patroni_admin1", "leader", "running", 1, nil)}}
	evaluatePatroni(&h, healthPD(), inst, c, nil, haproxyView{running: 0, desired: 2})
	if h.Level != HealthDown || !hasProblem(h, "haproxy_patroni") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestPatroniPausedIsDegraded(t *testing.T) {
	h := ServiceHealth{}
	inst := []swarmInstance{up("patroni_admin1", "")}
	c := &patroniCluster{Pause: true, Members: []patroniClusterMember{member("patroni_admin1", "leader", "running", 1, nil)}}
	evaluatePatroni(&h, healthPD(), inst, c, nil, okHaproxy)
	if h.Level != HealthDegraded || !hasProblem(h, "paused") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

// ── Garage ──

func garageViews(pd *pt.PlatformData) []garageInstanceView {
	var views []garageInstanceView
	for _, inst := range utils.GarageInstancesSorted(pd.PlatformInfo) {
		views = append(views, garageInstanceView{inst: inst,
			si: up(utils.GarageInstanceServiceName(inst.ID), inst.NodeIP),
			node: &garageStatusNode{ID: utils.GarageNodeID(inst), IsUp: true,
				Role: &struct {
					Zone string `json:"zone"`
				}{"dc1"},
				DataPartition: &garageFreeSpace{Available: 50 << 30, Total: 100 << 30}},
			queue: 7})
	}
	return views
}

var healthyGarage = &garageHealthFull{Status: "healthy", StorageNodes: 3, StorageNodesUp: 3,
	Partitions: 256, PartitionsQuorum: 256, PartitionsAllOk: 256}

func TestGarageHealthy(t *testing.T) {
	pd := garagePlatform("A", "B", "C")
	h := ServiceHealth{}
	evaluateGarage(&h, pd, garageViews(pd), healthyGarage, nil, false, 4)
	if h.Level != HealthOK {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
	if h.Rows[0][5] != "50.0 GiB (50%)" || h.Rows[0][6] != "7" {
		t.Fatalf("rows %v", h.Rows)
	}
}

func TestGarageResyncErrorsAndFullDiskAreDegraded(t *testing.T) {
	pd := garagePlatform("A", "B", "C")
	views := garageViews(pd)
	views[0].errs = 3
	views[1].node.DataPartition = &garageFreeSpace{Available: 5 << 30, Total: 100 << 30}
	h := ServiceHealth{}
	evaluateGarage(&h, pd, views, healthyGarage, nil, false, 4)
	if h.Level != HealthDegraded || !hasProblem(h, "failed to resync") || !hasProblem(h, "almost full") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestGarageInstanceDownIsDegraded(t *testing.T) {
	pd := garagePlatform("A", "B", "C")
	views := garageViews(pd)
	views[2].si = stopped("garage_3")
	views[2].node.IsUp = false
	h := ServiceHealth{}
	degraded := *healthyGarage
	degraded.Status, degraded.StorageNodesUp, degraded.PartitionsAllOk = "degraded", 2, 0
	evaluateGarage(&h, pd, views, &degraded, nil, false, 4)
	if h.Level != HealthDegraded || !hasProblem(h, "garage_3 is not running") || !hasProblem(h, "write quorum") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestGarageUnavailableIsDown(t *testing.T) {
	pd := garagePlatform("A", "B", "C")
	h := ServiceHealth{}
	bad := *healthyGarage
	bad.Status, bad.PartitionsQuorum = "unavailable", 0
	evaluateGarage(&h, pd, garageViews(pd), &bad, nil, false, 4)
	if h.Level != HealthDown {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestGarageNothingAnswersIsDown(t *testing.T) {
	pd := garagePlatform("A")
	views := garageViews(pd)
	views[0].node = nil
	h := ServiceHealth{}
	evaluateGarage(&h, pd, views, nil, errors.New("no Garage instance could run GetClusterHealth"), false, 0)
	if h.Level != HealthDown || !hasProblem(h, "no Garage instance answers") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}

func TestGaragePendingMoveIsDegraded(t *testing.T) {
	pd := garagePlatform("A", "A", "A")
	pd.PlatformInfo.GaragePendingMove = &pt.GarageMove{OldID: 3, NewID: 4, ToIP: "B"}
	h := ServiceHealth{}
	evaluateGarage(&h, pd, garageViews(pd), healthyGarage, nil, true, 2)
	if h.Level != HealthDegraded || !hasProblem(h, "service rebalance garage") {
		t.Fatalf("level %v problems %v", h.Level, h.Problems)
	}
}
