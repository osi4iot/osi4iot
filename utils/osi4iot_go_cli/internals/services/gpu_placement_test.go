package services

import (
	"reflect"
	"testing"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

const testGiB = int64(1) << 30

// The same table as system_manager's internal/pipelinesplacement: the
// CLI and the controller must take the same decision.
func TestDecidePipelinesPlacement(t *testing.T) {
	cpu := PipelinesWorkerUp{NanoCPUs: 8e9, MemoryBytes: 16 * testGiB}
	gpu := PipelinesWorkerUp{GPU: true, NanoCPUs: 8e9, MemoryBytes: 32 * testGiB}
	base := PipelinesPlacementInput{GPUMode: "auto", Replicas: 3, ReservedNanoCPUs: 2e9, ReservedMemoryBytes: 4 * testGiB, UsesGPU: true}
	dedicated := []string{"node.role==worker", "node.labels.pipelines_worker==true"}
	open := []string{"node.role==worker"}
	cases := []struct {
		name      string
		in        func(PipelinesPlacementInput) PipelinesPlacementInput
		want      []string
		spread    []string
		dedicated bool
	}{
		{"workers up with room: dedicated", func(i PipelinesPlacementInput) PipelinesPlacementInput {
			i.Workers = []PipelinesWorkerUp{cpu}
			return i
		},
			dedicated, []string{"node.labels.gpu"}, true},
		{"no worker up: open to the Platform workers", func(i PipelinesPlacementInput) PipelinesPlacementInput { return i },
			open, []string{"node.labels.gpu"}, false},
		{"not enough room: open", func(i PipelinesPlacementInput) PipelinesPlacementInput {
			i.Replicas = 5
			i.Workers = []PipelinesWorkerUp{cpu}
			return i
		}, open, []string{"node.labels.gpu"}, false},
		{"gpu_only with a GPU worker: only there", func(i PipelinesPlacementInput) PipelinesPlacementInput {
			i.GPUMode = "gpu_only"
			i.Workers = []PipelinesWorkerUp{cpu, gpu}
			return i
		}, append(append([]string{}, dedicated...), "node.labels.gpu==nvidia"), nil, true},
		{"gpu_only with the GPU workers off: open, on CPU", func(i PipelinesPlacementInput) PipelinesPlacementInput {
			i.GPUMode = "gpu_only"
			i.Workers = []PipelinesWorkerUp{cpu}
			return i
		}, open, []string{"node.labels.gpu"}, false},
		{"CPU image: no spread", func(i PipelinesPlacementInput) PipelinesPlacementInput {
			i.UsesGPU = false
			i.Workers = []PipelinesWorkerUp{cpu}
			return i
		}, dedicated, nil, true},
	}
	for _, c := range cases {
		got := DecidePipelinesPlacement(c.in(base))
		if !reflect.DeepEqual(got.Constraints, c.want) || !reflect.DeepEqual(got.Spread, c.spread) || got.Dedicated != c.dedicated {
			t.Errorf("%s: got %+v", c.name, got)
		}
	}
}

func pipelinesWorkersPlatform(mode string) *pt.PlatformData {
	pd := &pt.PlatformData{}
	pd.PlatformInfo.DeploymentLocation = "On-premise cluster deployment"
	pd.PlatformInfo.PipelinesGPUMode = mode
	pd.PlatformInfo.NodesData = []pt.NodeData{
		{NodeIP: "10.0.0.1", NodeRole: "Manager"},
		{NodeIP: "10.0.0.2", NodeRole: "Platform worker", NodeNanoCPUs: 8e9, NodeMemoryBytes: 16 * testGiB},
		{NodeIP: "10.0.0.3", NodeRole: PipelinesWorkerRole, NodeGPU: "nvidia", NodeNanoCPUs: 16e9, NodeMemoryBytes: 64 * testGiB},
	}
	pd.PlatformInfo.ServicesData = []pt.ServiceData{{ServiceName: "pipelines", Replicas: 2, Cpu: "2.0CPU", Memory: "4096MB"}}
	return pd
}

func TestPipelinesOnPipelinesWorkers(t *testing.T) {
	defer func() { LivePipelinesWorkers = nil }()
	roles := map[string]int{"Manager": 1, "Platform worker": 1, PipelinesWorkerRole: 1}

	// the GPU Pipelines worker is up: there, with the labels of the controller
	LivePipelinesWorkers = func(*pt.PlatformData) (map[string]bool, bool) { return map[string]bool{"10.0.0.3": true}, true }
	spec := PipelinesGPUSpecFor(pipelinesWorkersPlatform("auto"), roles)
	if !spec.UsesGPU || !spec.OnPipelinesWorkers || !reflect.DeepEqual(spec.Constraints, pipelinesDedicatedConstraints) {
		t.Fatalf("on the Pipelines worker: %+v", spec)
	}
	if spec.Labels[PipelinesPlacementLabel] != PipelinesPlacementManaged || spec.Labels[PipelinesGPUModeLabel] != "auto" {
		t.Fatalf("labels for the controller: %v", spec.Labels)
	}

	// switched off: on the Platform workers, still with the GPU image (CPU there)
	LivePipelinesWorkers = func(*pt.PlatformData) (map[string]bool, bool) { return map[string]bool{}, true }
	spec = PipelinesGPUSpecFor(pipelinesWorkersPlatform("gpu_only"), roles)
	if spec.OnPipelinesWorkers || !reflect.DeepEqual(spec.Constraints, pipelinesOpenConstraints) || !spec.UsesGPU {
		t.Fatalf("Pipelines workers off: %+v", spec)
	}

	// the swarm cannot be asked: they are taken as up
	LivePipelinesWorkers = func(*pt.PlatformData) (map[string]bool, bool) { return nil, false }
	spec = PipelinesGPUSpecFor(pipelinesWorkersPlatform("gpu_only"), roles)
	if !spec.OnPipelinesWorkers || spec.Constraints[len(spec.Constraints)-1] != "node.labels.gpu==nvidia" {
		t.Fatalf("gpu_only on the GPU Pipelines worker: %+v", spec)
	}

	// without Pipelines workers: as before, and no labels
	pd := pipelinesWorkersPlatform("auto")
	pd.PlatformInfo.NodesData[2].NodeRole = "Platform worker"
	spec = PipelinesGPUSpecFor(pd, map[string]int{"Manager": 1, "Platform worker": 2})
	if len(spec.Labels) != 0 || !reflect.DeepEqual(spec.Constraints, []string{"node.role==worker", "node.labels.platform_worker==true"}) {
		t.Fatalf("Platform workers only: %+v", spec)
	}
}
