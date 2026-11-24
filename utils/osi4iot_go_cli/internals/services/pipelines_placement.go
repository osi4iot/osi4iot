package services

import (
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Pipelines workers
//
// A "Pipelines worker" node (label pipelines_worker=true, and gpu=nvidia
// when it has a GPU) runs pipelines and nothing else of the platform: the
// other services ask for node.labels.platform_worker==true, which only the
// "Platform worker" nodes carry. pipelines runs there by default, and on
// the Platform workers while the Pipelines workers are off or cannot hold
// every replica (GPU machines switched off to save money, say). The
// system_manager controller (internal/pipelinesplacement) moves it back
// and forth as they go down and come up; the CLI takes the same decision
// when it deploys. DecidePipelinesPlacement is the controller's
// DecidePlacement: keep them the same.

const (
	PipelinesWorkerRole  = "Pipelines worker"
	PipelinesWorkerLabel = "pipelines_worker"
	// labels of the pipelines service that the controller reads
	PipelinesPlacementLabel   = "osi4iot.pipelines.placement"
	PipelinesPlacementManaged = "managed"
	PipelinesGPUModeLabel     = "osi4iot.pipelines.gpu_mode"
)

var (
	pipelinesDedicatedConstraints = []string{"node.role==worker", "node.labels.pipelines_worker==true"}
	pipelinesOpenConstraints      = []string{"node.role==worker"}
)

// PipelinesWorkerUp is a Pipelines worker that is up.
type PipelinesWorkerUp struct {
	GPU         bool
	NanoCPUs    int64
	MemoryBytes int64
}

// PipelinesPlacementInput is what the decision depends on.
type PipelinesPlacementInput struct {
	GPUMode             string
	Workers             []PipelinesWorkerUp
	Replicas            int
	ReservedNanoCPUs    int64
	ReservedMemoryBytes int64
	UsesGPU             bool
}

// PipelinesPlacement is the placement of the pipelines service.
type PipelinesPlacement struct {
	Constraints []string
	Spread      []string
	Dedicated   bool
}

func pipelinesSlots(w PipelinesWorkerUp, cpus, mem int64) int64 {
	n := int64(1 << 30)
	if cpus > 0 {
		n = min(n, w.NanoCPUs/cpus)
	}
	if mem > 0 {
		n = min(n, w.MemoryBytes/mem)
	}
	return n
}

// PipelinesWorkersFit says whether the workers hold every replica, by
// what each replica reserves.
func PipelinesWorkersFit(workers []PipelinesWorkerUp, replicas int, cpus, mem int64) bool {
	if len(workers) == 0 {
		return false
	}
	var total int64
	for _, w := range workers {
		total += pipelinesSlots(w, cpus, mem)
	}
	return total >= int64(replicas)
}

// DecidePipelinesPlacement: on the Pipelines workers (dedicated) when
// those up hold every replica (in gpu_only, those with a GPU), else on any
// worker (open). With the GPU image, spread over the gpu label unless the
// replicas are already kept on GPU nodes.
func DecidePipelinesPlacement(in PipelinesPlacementInput) PipelinesPlacement {
	candidates := in.Workers
	gpuOnly := in.GPUMode == pt.PipelinesGPUOnly && in.UsesGPU
	if gpuOnly {
		candidates = nil
		for _, w := range in.Workers {
			if w.GPU {
				candidates = append(candidates, w)
			}
		}
	}
	p := PipelinesPlacement{}
	if PipelinesWorkersFit(candidates, in.Replicas, in.ReservedNanoCPUs, in.ReservedMemoryBytes) {
		p.Dedicated = true
		p.Constraints = append([]string{}, pipelinesDedicatedConstraints...)
		if gpuOnly {
			p.Constraints = append(p.Constraints, "node.labels.gpu==nvidia")
		}
	} else {
		p.Constraints = append([]string{}, pipelinesOpenConstraints...)
	}
	if in.UsesGPU && !(p.Dedicated && gpuOnly) {
		p.Spread = []string{"node.labels.gpu"}
	}
	return p
}

// LivePipelinesWorkers tells which Pipelines workers are up (ready and
// active), by IP. Set by the docker package, which can ask the swarm; ok is
// false when it could not (then all of them are taken as up).
var LivePipelinesWorkers func(pd *pt.PlatformData) (up map[string]bool, ok bool)

// HasPipelinesWorkers: a cluster with nodes of the "Pipelines worker" role
func HasPipelinesWorkers(pd *pt.PlatformData) bool {
	if !isMultiNodeCluster(pd) {
		return false
	}
	for _, node := range pd.PlatformInfo.NodesData {
		if node.NodeRole == PipelinesWorkerRole {
			return true
		}
	}
	return false
}

// pipelinesWorkersUp are the Pipelines workers of the state file that are up
func pipelinesWorkersUp(pd *pt.PlatformData) []PipelinesWorkerUp {
	var up map[string]bool
	ok := false
	if LivePipelinesWorkers != nil {
		up, ok = LivePipelinesWorkers(pd)
	}
	var out []PipelinesWorkerUp
	for _, node := range pd.PlatformInfo.NodesData {
		if node.NodeRole != PipelinesWorkerRole || (ok && !up[node.NodeIP]) {
			continue
		}
		out = append(out, PipelinesWorkerUp{GPU: node.NodeGPU != "", NanoCPUs: node.NodeNanoCPUs, MemoryBytes: node.NodeMemoryBytes})
	}
	return out
}
