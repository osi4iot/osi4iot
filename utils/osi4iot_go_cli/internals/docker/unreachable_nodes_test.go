package docker

import (
	"strings"
	"testing"
	"time"

	"github.com/docker/docker/api/types/swarm"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// A node that does not answer on its SSH port is unreachable at once, so
// SetDockerClientsMap stores nil for it instead of a client that fails
// later, after ssh's 30 s timeout, in the middle of a command.
func TestNodeReachable(t *testing.T) {
	old := sshReachTimeout
	sshReachTimeout = 300 * time.Millisecond
	defer func() { sshReachTimeout = old }()

	start := time.Now()
	// TEST-NET-1: never routed, so the dial waits until the timeout (or is refused at once)
	err := nodeReachable("192.0.2.1")
	if err == nil || !strings.Contains(err.Error(), "192.0.2.1 is unreachable") {
		t.Fatalf("expected the node unreachable, got %v", err)
	}
	if time.Since(start) > 3*time.Second {
		t.Fatalf("the probe took %s", time.Since(start))
	}
}

func TestUnreachableNodesAndCheck(t *testing.T) {
	saved := map[string]*pt.DockerClient{}
	for k, v := range pt.DCMap {
		saved[k] = v
		delete(pt.DCMap, k)
	}
	defer func() {
		for k := range pt.DCMap {
			delete(pt.DCMap, k)
		}
		for k, v := range saved {
			pt.DCMap[k] = v
		}
	}()

	manager := pt.NodeData{NodeIP: "10.0.0.1", NodeRole: "Manager"}
	worker := pt.NodeData{NodeIP: "10.0.0.2", NodeRole: "Platform worker"}
	pt.DCMap[manager.NodeIP] = &pt.DockerClient{Node: manager}
	pt.DCMap[worker.NodeIP] = nil
	pd := &pt.PlatformData{}
	pd.PlatformInfo.NodesData = []pt.NodeData{manager, worker}

	if got := UnreachableNodes(pd); len(got) != 1 || got[0] != "10.0.0.2" {
		t.Fatalf("unreachable nodes: %v", got)
	}
	// stop, run…: go on with the manager
	for _, action := range []string{"stop", "run", "status", "node"} {
		if err := CheckDockerClientsMap(pt.DCMap, action); err != nil {
			t.Fatalf("%s refused with a worker down: %v", action, err)
		}
	}
	// init and delete need every node
	for _, action := range []string{"init", "delete"} {
		if err := CheckDockerClientsMap(pt.DCMap, action); err == nil {
			t.Fatalf("%s accepted with a node down", action)
		}
	}
}

// A service whose node is switched off has only pending tasks that the
// scheduler cannot place: `run` does not wait for it.
func TestWaitsForMissingNode(t *testing.T) {
	pending := func(err string) swarm.Task {
		return swarm.Task{DesiredState: swarm.TaskStateRunning, Status: swarm.TaskStatus{State: swarm.TaskStatePending, Err: err}}
	}
	running := swarm.Task{DesiredState: swarm.TaskStateRunning, Status: swarm.TaskStatus{State: swarm.TaskStateRunning}}
	shutdown := swarm.Task{DesiredState: swarm.TaskStateShutdown, Status: swarm.TaskStatus{State: swarm.TaskStateShutdown}}

	cases := []struct {
		name  string
		tasks []swarm.Task
		want  bool
	}{
		{"no suitable node", []swarm.Task{pending("no suitable node (scheduling constraints not satisfied on 2 nodes)"), shutdown}, true},
		{"running", []swarm.Task{running}, false},
		{"pending for another reason", []swarm.Task{pending("")}, false},
		{"one runs, one waits", []swarm.Task{running, pending("no suitable node")}, false},
		{"no tasks yet", nil, false},
	}
	for _, c := range cases {
		if got := waitsForMissingNode(c.tasks); got != c.want {
			t.Errorf("%s: got %v", c.name, got)
		}
	}
}
