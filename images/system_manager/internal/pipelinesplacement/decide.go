// Package pipelinesplacement keeps the pipelines service on the
// "Pipelines worker" nodes while they are up, and lets it run on the
// "Platform worker" nodes while they are not.
//
// Swarm alone moves the replicas of a node that goes down to any other
// node the service may run on, but it never moves them back when the
// node returns, and it has no notion of preferring some nodes. So the
// placement of pipelines has two states:
//
//   - dedicated: node.labels.pipelines_worker==true (and gpu==nvidia in
//     gpu_only mode). Chosen while the Pipelines workers that are up, and
//     have been up for StableFor, have room for every replica.
//   - open: any worker (Pipelines or Platform). Chosen otherwise: all the
//     Pipelines workers are off (GPU machines switched off to save money,
//     say), or they cannot hold every replica. The replicas then run on
//     the Platform workers on CPU (the GPU image falls back to CPU, and
//     the digital twins that require a GPU wait with "No GPU replica
//     available" until a GPU node is back).
//
// The controller (controller.go) watches the swarm's node events, and
// checks every minute in case one is missed. It acts only on a pipelines
// service the CLI labelled osi4iot.pipelines.placement=managed (a
// platform with Pipelines workers); the CLI takes the same decision
// (DecidePlacement, kept identical in the CLI's services package) when it
// deploys.
package pipelinesplacement

import "sort"

const (
	// labels of the pipelines service, written by the CLI
	ManagedLabel  = "osi4iot.pipelines.placement"
	ManagedValue  = "managed"
	GPUModeLabel  = "osi4iot.pipelines.gpu_mode"
	WorkerLabel   = "pipelines_worker"
	GPULabel      = "gpu"
	GPUOnly       = "gpu_only"
	GPUOff        = "off"
	spreadOverGPU = "node.labels.gpu"
)

var (
	DedicatedConstraints = []string{"node.role==worker", "node.labels.pipelines_worker==true"}
	OpenConstraints      = []string{"node.role==worker"}
)

// Worker is a Pipelines worker that is up: ready, active, and up for
// long enough (StableFor).
type Worker struct {
	GPU         bool
	NanoCPUs    int64
	MemoryBytes int64
}

// Input is what the decision depends on.
type Input struct {
	// PIPELINES_GPU_MODE: auto, gpu_only or off
	GPUMode  string
	Workers  []Worker
	Replicas int
	// what each replica reserves
	ReservedNanoCPUs    int64
	ReservedMemoryBytes int64
	// the pipelines image uses the GPU (GPU flavor)
	UsesGPU bool
}

// Placement is the placement of the pipelines service.
type Placement struct {
	Constraints []string
	Spread      []string
	Dedicated   bool
}

// slots is how many replicas a node holds by its reservations
func slots(w Worker, cpus, mem int64) int64 {
	n := int64(1 << 30)
	if cpus > 0 {
		n = min(n, w.NanoCPUs/cpus)
	}
	if mem > 0 {
		n = min(n, w.MemoryBytes/mem)
	}
	return n
}

// Fits says whether the workers hold every replica.
func Fits(workers []Worker, replicas int, cpus, mem int64) bool {
	if len(workers) == 0 {
		return false
	}
	var total int64
	for _, w := range workers {
		total += slots(w, cpus, mem)
		if total >= int64(replicas) {
			return true
		}
	}
	return total >= int64(replicas)
}

// DecidePlacement chooses dedicated or open.
func DecidePlacement(in Input) Placement {
	candidates := in.Workers
	gpuOnly := in.GPUMode == GPUOnly && in.UsesGPU
	if gpuOnly {
		candidates = nil
		for _, w := range in.Workers {
			if w.GPU {
				candidates = append(candidates, w)
			}
		}
	}
	p := Placement{}
	if Fits(candidates, in.Replicas, in.ReservedNanoCPUs, in.ReservedMemoryBytes) {
		p.Dedicated = true
		p.Constraints = append([]string{}, DedicatedConstraints...)
		if gpuOnly {
			p.Constraints = append(p.Constraints, "node.labels.gpu==nvidia")
		}
	} else {
		p.Constraints = append([]string{}, OpenConstraints...)
	}
	// With the GPU image and nothing that keeps the replicas on GPU nodes,
	// spreading over the gpu label puts some of them on the GPU nodes
	// there are (for the digital twins that require a GPU).
	if in.UsesGPU && !(p.Dedicated && gpuOnly) {
		p.Spread = []string{spreadOverGPU}
	}
	return p
}

// SamePlacement compares constraints and spread descriptors, in any order.
func SamePlacement(constraints, spread []string, p Placement) bool {
	return sameSet(constraints, p.Constraints) && sameSet(spread, p.Spread)
}

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	x := append([]string{}, a...)
	y := append([]string{}, b...)
	sort.Strings(x)
	sort.Strings(y)
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}
