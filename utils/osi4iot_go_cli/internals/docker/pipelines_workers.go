package docker

import (
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/services"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// The pipelines service is placed on the Pipelines workers that are up
// (services/pipelines_placement.go): the services package asks the swarm
// through this.
func init() {
	services.LivePipelinesWorkers = livePipelinesWorkers
}

// livePipelinesWorkers: the Pipelines workers ready and active, by IP.
// Not ok when the swarm cannot be asked (then they are all taken as up).
func livePipelinesWorkers(pd *pt.PlatformData) (map[string]bool, bool) {
	if !services.HasPipelinesWorkers(pd) {
		return nil, false
	}
	dc, err := GetManagerDC()
	if err != nil || dc == nil {
		return nil, false
	}
	nodes, err := getSwarmNodesMap(dc)
	if err != nil {
		return nil, false
	}
	up := map[string]bool{}
	for ip, node := range nodes {
		if pipelinesWorkerIsUp(node) {
			up[ip] = true
		}
	}
	return up, true
}

func pipelinesWorkerIsUp(node swarm.Node) bool {
	return node.Spec.Labels[services.PipelinesWorkerLabel] == "true" &&
		node.Status.State == swarm.NodeStateReady &&
		node.Spec.Availability == swarm.NodeAvailabilityActive
}
