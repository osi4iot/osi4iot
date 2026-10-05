package docker

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// fakeGarage simulates the parts of Garage the steps rely on: a
// versioned layout, a "Draining" period after every change, resync
// queues that take a few polls to empty, nodes that take a while to
// connect after their service is created.
type fakeGarage struct {
	t        *testing.T
	pd       *pt.PlatformData
	health   string
	version  int64
	roles    map[string]bool // node ID -> has a role
	up       map[string]int  // node ID -> polls until up (0 = up)
	draining int             // polls left with a Draining version
	queue    map[string]int  // node ID -> blocks to resync
	running  map[int]bool    // instance services that exist
	events   []string
	crashOn  string       // event name that panics once, to simulate an interruption
	polls    int          // statistics requests: a wait on a queue that never empties shows here
	aliasOff map[int]bool // instances without the "garage" client alias
	saves    int
}

type crash struct{}

func newFakeGarage(t *testing.T, pd *pt.PlatformData) *fakeGarage {
	f := &fakeGarage{t: t, pd: pd, health: "healthy", version: 1,
		roles: map[string]bool{}, up: map[string]int{}, queue: map[string]int{}, running: map[int]bool{}}
	for _, inst := range pd.PlatformInfo.GarageInstances {
		f.roles[utils.GarageNodeID(inst)] = true
		f.running[inst.ID] = true
		f.up[utils.GarageNodeID(inst)] = 0 // already connected
	}
	return f
}

func (f *fakeGarage) event(e string) {
	f.events = append(f.events, e)
	if f.crashOn != "" && strings.HasPrefix(e, f.crashOn) {
		f.crashOn = ""
		panic(crash{})
	}
}

func (f *fakeGarage) Admin(endpoint string, payload any, avoidID int) ([]byte, error) {
	var out any
	switch endpoint {
	case "GetClusterHealth":
		out = map[string]string{"status": f.health}
	case "GetClusterLayout":
		roles := []map[string]string{}
		for id, has := range f.roles {
			if has {
				roles = append(roles, map[string]string{"id": id})
			}
		}
		out = map[string]any{"version": f.version, "roles": roles, "stagedRoleChanges": []any{}}
	case "GetClusterLayoutHistory":
		status := "Historical"
		if f.draining > 0 {
			f.draining--
			status = "Draining"
		}
		out = map[string]any{"currentVersion": f.version,
			"versions": []map[string]any{{"version": f.version, "status": "Current"}, {"version": f.version - 1, "status": status}}}
	case "GetClusterStatus":
		nodes := []map[string]any{}
		for id, polls := range f.up {
			if polls > 0 {
				f.up[id]--
			}
			nodes = append(nodes, map[string]any{"id": id, "isUp": polls == 0})
		}
		out = map[string]any{"nodes": nodes}
	case "UpdateClusterLayout":
		b, _ := json.Marshal(payload)
		var req struct {
			Roles []map[string]any `json:"roles"`
		}
		json.Unmarshal(b, &req)
		var parts []string
		for _, r := range req.Roles {
			id := r["id"].(string)
			if r["remove"] == true {
				f.roles[id] = false
				parts = append(parts, "-"+f.instanceOf(id))
			} else {
				f.roles[id] = true
				parts = append(parts, "+"+f.instanceOf(id))
				f.queue[id] = 4 // the new node fetches blocks
			}
		}
		f.event("layout " + strings.Join(parts, " "))
		out = map[string]any{}
	case "ApplyClusterLayout":
		b, _ := json.Marshal(payload)
		var req struct{ Version int64 }
		json.Unmarshal(b, &req)
		if req.Version != f.version+1 {
			f.t.Fatalf("apply v%d on v%d", req.Version, f.version)
		}
		f.version = req.Version
		f.draining = 3
		for id, has := range f.roles {
			if !has {
				f.queue[id] = 5 // a retiring node offloads its blocks
			}
		}
		f.event(fmt.Sprintf("apply v%d", f.version))
		out = map[string]any{}
	case "GetNodeStatistics":
		id := payload.(map[string]any)["node"].(string)
		f.polls++
		if f.polls > 1000 {
			f.t.Fatal("still polling after 1000 statistics requests: waiting on the queue " +
				"of a node in the layout, which never empties on a live platform")
		}
		q := f.queue[id]
		if f.roles[id] {
			// A node in the layout on a live platform: blocks written
			// and released keep passing through its queue.
			q = 5
		} else if q > 0 {
			f.queue[id]--
		}
		out = map[string]any{"success": map[string]any{id: map[string]any{
			"blockManagerStats": map[string]any{"resyncQueueLen": q, "resyncErrors": 0}}}}
	case "LaunchRepairOperation":
		b, _ := json.Marshal(payload)
		if !strings.Contains(string(b), `"repairType":"blocks"`) {
			f.t.Fatalf("repair payload %s", b)
		}
		f.event("repair " + f.instanceOf(payload.(map[string]any)["node"].(string)))
		out = map[string]any{"success": map[string]any{}}
	default:
		f.t.Fatalf("unexpected endpoint %s", endpoint)
	}
	return json.Marshal(out)
}

func (f *fakeGarage) instanceOf(nodeID string) string {
	for _, inst := range f.pd.PlatformInfo.GarageInstances {
		if utils.GarageNodeID(inst) == nodeID {
			return fmt.Sprintf("garage_%d", inst.ID)
		}
	}
	return "?"
}

func (f *fakeGarage) Save() error    { f.saves++; return nil }
func (f *fakeGarage) Relabel() error { return nil }
func (f *fakeGarage) CreateInstance(inst pt.GarageInstance) error {
	if f.running[inst.ID] {
		return nil
	}
	f.running[inst.ID] = true
	f.up[utils.GarageNodeID(inst)] = 2
	if f.aliasOff == nil {
		f.aliasOff = map[int]bool{}
	}
	f.aliasOff[inst.ID] = true // created without the client alias
	f.event(fmt.Sprintf("create garage_%d@%s", inst.ID, inst.NodeIP))
	return nil
}
func (f *fakeGarage) RemoveInstance(inst pt.GarageInstance) error {
	id := utils.GarageNodeID(inst)
	if f.draining > 0 || f.queue[id] > 0 {
		f.t.Fatalf("garage_%d removed before its data was migrated (draining=%d queue=%d)",
			inst.ID, f.draining, f.queue[id])
	}
	delete(f.running, inst.ID)
	f.event(fmt.Sprintf("remove garage_%d", inst.ID))
	return nil
}
func (f *fakeGarage) Sleep(time.Duration) {}

func (f *fakeGarage) SetClientAlias(inst pt.GarageInstance, serve bool) error {
	if f.aliasOff == nil {
		f.aliasOff = map[int]bool{}
	}
	if f.aliasOff[inst.ID] == !serve {
		return nil
	}
	f.aliasOff[inst.ID] = !serve
	state := "off"
	if serve {
		state = "on"
		// Only a node in the layout with its tables synced may serve.
		if !f.roles[utils.GarageNodeID(inst)] || f.draining > 0 {
			f.t.Fatalf("garage_%d given the client alias before it is in the layout and synced", inst.ID)
		}
	} else if !f.roles[utils.GarageNodeID(inst)] {
		f.t.Fatalf("garage_%d lost the client alias only after leaving the layout", inst.ID)
	}
	f.event(fmt.Sprintf("alias garage_%d %s", inst.ID, state))
	return nil
}
func (f *fakeGarage) Logf(string, ...any) {}

func garagePlatform(ips ...string) *pt.PlatformData {
	pd := &pt.PlatformData{}
	pd.PlatformInfo = pt.PlatformInfo{S3BucketType: utils.S3BucketTypeGarage,
		DeploymentLocation: "On-premise cluster deployment", GarageReplicationFactor: 3}
	for _, ip := range ips {
		utils.NewGarageInstance(&pd.PlatformInfo, ip)
	}
	return pd
}

func placement(pd *pt.PlatformData) string {
	var parts []string
	for _, inst := range utils.GarageInstancesSorted(pd.PlatformInfo) {
		parts = append(parts, fmt.Sprintf("%d@%s", inst.ID, inst.NodeIP))
	}
	return strings.Join(parts, " ")
}

func TestGarageMoveOneToTwoWorkers(t *testing.T) {
	pd := garagePlatform("A", "A", "A")
	f := newFakeGarage(t, pd)
	if err := rebalanceGarage(pd, f, []string{"A", "B"}); err != nil {
		t.Fatal(err)
	}
	want := "create garage_4@B,alias garage_3 off,layout +garage_4 -garage_3,apply v2,repair garage_4,alias garage_4 on,remove garage_3"
	if got := strings.Join(f.events, ","); got != want {
		t.Fatalf("events:\n %s\nwant\n %s", got, want)
	}
	if placement(pd) != "1@A 2@A 4@B" || pd.PlatformInfo.GaragePendingMove != nil {
		t.Fatalf("placement %s pending %v", placement(pd), pd.PlatformInfo.GaragePendingMove)
	}
}

func TestGarageScaleFiveToThree(t *testing.T) {
	pd := garagePlatform("A", "B", "C", "D", "E")
	f := newFakeGarage(t, pd)
	if err := scaleGarage(pd, f, []string{"A", "B", "C", "D", "E"}, 3); err != nil {
		t.Fatal(err)
	}
	// One instance per layout change, each retired only once migrated
	// (RemoveInstance fails the test otherwise).
	want := "alias garage_5 off,layout -garage_5,apply v2,remove garage_5,alias garage_4 off,layout -garage_4,apply v3,remove garage_4"
	if got := strings.Join(f.events, ","); got != want {
		t.Fatalf("events:\n %s\nwant\n %s", got, want)
	}
	if placement(pd) != "1@A 2@B 3@C" {
		t.Fatalf("placement %s", placement(pd))
	}
}

func TestGarageScaleThreeToFive(t *testing.T) {
	pd := garagePlatform("A", "B", "C")
	f := newFakeGarage(t, pd)
	if err := scaleGarage(pd, f, []string{"A", "B", "C", "D", "E"}, 5); err != nil {
		t.Fatal(err)
	}
	want := "create garage_4@D,layout +garage_4,apply v2,repair garage_4,alias garage_4 on,create garage_5@E,layout +garage_5,apply v3,repair garage_5,alias garage_5 on"
	if got := strings.Join(f.events, ","); got != want {
		t.Fatalf("events:\n %s\nwant\n %s", got, want)
	}
}

func TestGarageScaleNeverBelowReplicationFactor(t *testing.T) {
	pd := garagePlatform("A", "B", "C")
	f := newFakeGarage(t, pd)
	if err := scaleGarage(pd, f, []string{"A", "B", "C"}, 2); err == nil {
		t.Fatal("scaled below the replication factor")
	}
	if len(f.events) != 0 {
		t.Fatalf("changed something: %v", f.events)
	}
}

func TestGarageInterruptedMoveIsResumed(t *testing.T) {
	pd := garagePlatform("A", "A", "A")
	f := newFakeGarage(t, pd)
	f.crashOn = "apply" // interrupted right after the layout change

	func() {
		defer func() {
			if r := recover(); r == nil {
				t.Fatal("no interruption")
			} else if _, ok := r.(crash); !ok {
				panic(r)
			}
		}()
		rebalanceGarage(pd, f, []string{"A", "B"})
	}()
	pending := pd.PlatformInfo.GaragePendingMove
	if pending == nil || pending.OldID != 3 || pending.NewID != 4 {
		t.Fatalf("interrupted step not recorded: %+v", pending)
	}

	// Second run: same step, finished — no second instance, no second
	// layout change.
	if err := rebalanceGarage(pd, f, []string{"A", "B"}); err != nil {
		t.Fatal(err)
	}
	if strings.Count(strings.Join(f.events, ","), "create") != 1 ||
		strings.Count(strings.Join(f.events, ","), "apply") != 1 {
		t.Fatalf("step repeated: %v", f.events)
	}
	if placement(pd) != "1@A 2@A 4@B" || pd.PlatformInfo.GaragePendingMove != nil {
		t.Fatalf("placement %s pending %v", placement(pd), pd.PlatformInfo.GaragePendingMove)
	}
}

func TestGarageRefusesToStartWhenUnhealthy(t *testing.T) {
	pd := garagePlatform("A", "A", "A")
	f := newFakeGarage(t, pd)
	f.health = "degraded"
	err := rebalanceGarage(pd, f, []string{"A", "B"})
	if err == nil || !strings.Contains(err.Error(), "not healthy") {
		t.Fatalf("err = %v", err)
	}
	if len(f.events) != 0 || pd.PlatformInfo.GaragePendingMove != nil {
		t.Fatal("started a change on an unhealthy cluster")
	}
}

func TestGarageSecondMoveReusesFreedNumber(t *testing.T) {
	// 1 -> 2 workers moves garage_3 to B as garage_4; 2 -> 3 workers then
	// moves one of A's instances to C, and it takes the freed 3.
	pd := garagePlatform("A", "A", "A")
	f := newFakeGarage(t, pd)
	if err := rebalanceGarage(pd, f, []string{"A", "B"}); err != nil {
		t.Fatal(err)
	}
	if err := rebalanceGarage(pd, f, []string{"A", "B", "C"}); err != nil {
		t.Fatal(err)
	}
	if got := placement(pd); got != "1@A 3@C 4@B" {
		t.Fatalf("placement %s, want 1@A 3@C 4@B", got)
	}
}

func TestGarageEvacuateNode(t *testing.T) {
	pd := garagePlatform("A", "B", "C")
	pd.PlatformInfo.NodesData = []pt.NodeData{
		{NodeIP: "A", NodeRole: "Platform worker"}, {NodeIP: "B", NodeRole: "Platform worker"},
		{NodeIP: "C", NodeRole: "Platform worker"}}
	f := newFakeGarage(t, pd)
	if err := rebalanceGarage(pd, f, garageHostsWithout(pd.PlatformInfo, "C")); err != nil {
		t.Fatal(err)
	}
	if placement(pd) != "1@A 2@B 4@A" {
		t.Fatalf("placement %s, want C empty and A:2 B:1", placement(pd))
	}
}
