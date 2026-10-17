package services

import (
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// GPU nodes are expensive: they are kept for pipelines.
//
// Only in clusters: a local deployment, or any platform with a single
// node, runs everything on that one machine, GPU or not.
//
// Every other service gets "node.labels.gpu!=nvidia" (which nodes without
// the label also satisfy), but only where that cannot leave it with
// nowhere to run:
//
//   - pipelines: the one service that is meant to run there.
//   - Global services (vector, keepalived…): one task per node by design.
//   - Services pinned to a node by a label (nats_N, admin-id, metrics-id,
//     garage_N): they follow their volumes; moving them is not an option.
//   - Services whose eligible nodes are all GPU nodes (a single-node
//     platform on a GPU machine, say): the constraint would make them
//     unschedulable.
//   - A constraint this code does not understand: it cannot tell which
//     nodes are eligible, so it does not risk it.
const gpuAvoidConstraint = "node.labels.gpu!=nvidia"

// gpuExemptServices are never kept off the GPU nodes.
var gpuExemptServices = map[string]bool{
	"pipelines": true,
}

// applyGpuAvoidance adds gpuAvoidConstraint to every service it is safe
// for. Services are values in the map, so they are written back.
func applyGpuAvoidance(services map[string]pt.Service, pd *pt.PlatformData) {
	if !isMultiNodeCluster(pd) || !anyGPUNode(pd) {
		return
	}
	for name, svc := range services {
		if !shouldAvoidGPU(name, svc, pd) {
			continue
		}
		placement := *svc.TaskTemplate.Placement
		placement.Constraints = append(append([]string{}, placement.Constraints...), gpuAvoidConstraint)
		svc.TaskTemplate.Placement = &placement
		services[name] = svc
	}
}

// isMultiNodeCluster is false for a local deployment and for any platform
// with a single node: there is no other machine to keep services on.
func isMultiNodeCluster(pd *pt.PlatformData) bool {
	pi := pd.PlatformInfo
	return pi.DeploymentLocation != "Local deployment" && len(pi.NodesData) > 1
}

func anyGPUNode(pd *pt.PlatformData) bool {
	for _, node := range pd.PlatformInfo.NodesData {
		if node.NodeGPU != "" {
			return true
		}
	}
	return false
}

func shouldAvoidGPU(name string, svc pt.Service, pd *pt.PlatformData) bool {
	if gpuExemptServices[name] {
		return false
	}
	if svc.Mode.Global != nil {
		return false
	}
	if svc.TaskTemplate.Placement == nil {
		return false
	}

	var eligible []pt.NodeData
	for _, node := range pd.PlatformInfo.NodesData {
		ok, understood := nodeMatches(node, svc.TaskTemplate.Placement.Constraints)
		if !understood {
			return false
		}
		if ok {
			eligible = append(eligible, node)
		}
	}

	hasGPU, hasCPU := false, false
	for _, node := range eligible {
		if node.NodeGPU != "" {
			hasGPU = true
		} else {
			hasCPU = true
		}
	}
	// Nothing to avoid, or nowhere else to go.
	return hasGPU && hasCPU
}

// nodeMatches evaluates the placement constraints this platform writes
// against a state-file node. understood is false as soon as one
// constraint is not one of those: then the caller must not guess.
func nodeMatches(node pt.NodeData, constraints []string) (matches bool, understood bool) {
	matches = true
	for _, raw := range constraints {
		c := strings.ReplaceAll(raw, " ", "")
		switch {
		case c == "":
			continue
		case c == "node.role==manager":
			matches = matches && node.NodeRole == "Manager"
		case c == "node.role==worker":
			matches = matches && node.NodeRole != "Manager"
		case c == "node.labels.platform_worker==true":
			matches = matches && node.NodeRole == "Platform worker"
		case c == "node.labels.gpu==nvidia":
			matches = matches && node.NodeGPU == "nvidia"
		case c == "node.labels.gpu!=nvidia":
			matches = matches && node.NodeGPU != "nvidia"
		default:
			// nats_N, admin-id, metrics-id, garage_N, hostnames, …:
			// pinned or unknown. Not ours to second-guess.
			return false, false
		}
	}
	return matches, true
}
