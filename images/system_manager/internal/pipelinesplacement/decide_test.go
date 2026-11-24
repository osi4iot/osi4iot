package pipelinesplacement

import (
	"reflect"
	"testing"
	"time"

	"github.com/moby/moby/api/types/swarm"
)

const gib = int64(1) << 30

func TestDecidePlacement(t *testing.T) {
	cpu := Worker{NanoCPUs: 8e9, MemoryBytes: 16 * gib}
	gpu := Worker{GPU: true, NanoCPUs: 8e9, MemoryBytes: 32 * gib}
	base := Input{GPUMode: "auto", Replicas: 3, ReservedNanoCPUs: 2e9, ReservedMemoryBytes: 4 * gib, UsesGPU: true}

	cases := []struct {
		name    string
		in      func(Input) Input
		want    []string
		spread  []string
		dedicat bool
	}{
		{"workers up with room: dedicated", func(i Input) Input { i.Workers = []Worker{cpu}; return i },
			DedicatedConstraints, []string{"node.labels.gpu"}, true},
		{"no worker up: open to the Platform workers", func(i Input) Input { return i },
			OpenConstraints, []string{"node.labels.gpu"}, false},
		{"not enough room: open", func(i Input) Input { i.Replicas = 5; i.Workers = []Worker{cpu}; return i },
			OpenConstraints, []string{"node.labels.gpu"}, false},
		{"gpu_only with a GPU worker: only there", func(i Input) Input { i.GPUMode = "gpu_only"; i.Workers = []Worker{cpu, gpu}; return i },
			append(append([]string{}, DedicatedConstraints...), "node.labels.gpu==nvidia"), nil, true},
		{"gpu_only with the GPU workers off: open, on CPU", func(i Input) Input { i.GPUMode = "gpu_only"; i.Workers = []Worker{cpu}; return i },
			OpenConstraints, []string{"node.labels.gpu"}, false},
		{"CPU image: no spread", func(i Input) Input { i.UsesGPU = false; i.Workers = []Worker{cpu}; return i },
			DedicatedConstraints, nil, true},
	}
	for _, c := range cases {
		got := DecidePlacement(c.in(base))
		if !reflect.DeepEqual(got.Constraints, c.want) || !reflect.DeepEqual(got.Spread, c.spread) || got.Dedicated != c.dedicat {
			t.Errorf("%s: got %+v", c.name, got)
		}
	}
}

func TestFits(t *testing.T) {
	w := Worker{NanoCPUs: 4e9, MemoryBytes: 8 * gib}
	if !Fits([]Worker{w, w}, 4, 2e9, 4*gib) || Fits([]Worker{w}, 3, 2e9, 4*gib) || Fits(nil, 0, 0, 0) {
		t.Fatal("slots by CPU and memory")
	}
	if !Fits([]Worker{w}, 10, 0, 0) {
		t.Fatal("without reservations a worker holds any number")
	}
}

func TestStableWorkers(t *testing.T) {
	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	c := &Controller{StableFor: time.Minute, now: func() time.Time { return now }, upSince: map[string]time.Time{}}
	node := func(id string, state swarm.NodeState, labels map[string]string) swarm.Node {
		n := swarm.Node{ID: id}
		n.Spec.Role = swarm.NodeRoleWorker
		n.Spec.Availability = swarm.NodeAvailabilityActive
		n.Spec.Labels = labels
		n.Status.State = state
		n.Description.Resources = swarm.Resources{NanoCPUs: 4e9, MemoryBytes: 8 * gib}
		return n
	}
	nodes := []swarm.Node{
		node("a", swarm.NodeStateReady, map[string]string{"pipelines_worker": "true", "gpu": "nvidia"}),
		node("b", swarm.NodeStateDown, map[string]string{"pipelines_worker": "true"}),
		node("c", swarm.NodeStateReady, map[string]string{"platform_worker": "true"}),
	}
	if up, stable := c.workers(nodes); len(up) != 1 || len(stable) != 0 {
		t.Fatalf("a worker just up is up, not stable yet: %v %v", up, stable)
	}
	if c.nextStable() <= 0 {
		t.Fatal("a check is due when it becomes stable")
	}
	now = now.Add(2 * time.Minute)
	_, got := c.workers(nodes)
	if len(got) != 1 || !got[0].GPU {
		t.Fatalf("the GPU worker up for 2 min: %v", got)
	}
	// down again: it starts over
	nodes[0].Status.State = swarm.NodeStateDown
	c.workers(nodes)
	nodes[0].Status.State = swarm.NodeStateReady
	if _, got := c.workers(nodes); len(got) != 0 {
		t.Fatalf("back up: not stable yet: %v", got)
	}
}

func TestInputOf(t *testing.T) {
	replicas := uint64(4)
	spec := swarm.ServiceSpec{}
	spec.Annotations.Labels = map[string]string{GPUModeLabel: "gpu_only"}
	spec.Mode.Replicated = &swarm.ReplicatedService{Replicas: &replicas}
	spec.TaskTemplate.Resources = &swarm.ResourceRequirements{Reservations: &swarm.Resources{NanoCPUs: 1e9, MemoryBytes: gib}}
	spec.TaskTemplate.ContainerSpec = &swarm.ContainerSpec{Env: []string{"NVIDIA_VISIBLE_DEVICES=all"}}
	in := inputOf(spec, nil)
	if in.Replicas != 4 || in.GPUMode != "gpu_only" || !in.UsesGPU || in.ReservedNanoCPUs != 1e9 {
		t.Fatalf("%+v", in)
	}
}

func TestIsDedicated(t *testing.T) {
	if !isDedicated(DedicatedConstraints) || isDedicated(OpenConstraints) || !isDedicated([]string{"node.labels.pipelines_worker == true"}) {
		t.Fatal("dedicated: the pipelines_worker constraint")
	}
}
