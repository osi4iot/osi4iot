package utils

import (
	"sort"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// ServiceImageChange is one service whose image `osi4iot init` replaced
// with the CLI's default.
type ServiceImageChange struct {
	Service string
	From    string
	To      string
}

// ApplyDefaultServiceImages sets every service of the state file to the
// image this CLI deploys by default (GetDefaultServicesDataMap), so that
// `osi4iot init` brings up the versions the CLI was released with and
// not the ones an older state file recorded. Replicas, CPU and memory are
// left as the state file has them, and services the CLI has no default
// for (custom services) keep their image. Returns what changed, sorted
// by service.
func ApplyDefaultServiceImages(pd *types.PlatformData) []ServiceImageChange {
	defaults := GetDefaultServicesDataMap(pd)
	changes := []ServiceImageChange{}
	for i, svc := range pd.PlatformInfo.ServicesData {
		def, ok := defaults[svc.ServiceName]
		if !ok || def.Image == "" || svc.Image == def.Image {
			continue
		}
		changes = append(changes, ServiceImageChange{Service: svc.ServiceName, From: svc.Image, To: def.Image})
		pd.PlatformInfo.ServicesData[i].Image = def.Image
	}
	sort.Slice(changes, func(a, b int) bool { return changes[a].Service < changes[b].Service })
	return changes
}

// RefreshLocalNodeData replaces NODES_DATA of a local deployment with this
// computer's data (IP, host name, user, architecture, CPUs, memory), so a
// state file written on another machine, or before the IP changed, does
// not point the deployment at a computer that is not this one. The node
// label is kept; the swarm node ID is cleared (it is read back once the
// swarm exists). The Garage instances, which are pinned to a node by IP,
// all move to this computer's IP: a local deployment has no other node.
// Returns the node the state file had (the zero value if none).
func RefreshLocalNodeData(pi *types.PlatformInfo) (types.NodeData, error) {
	var previous types.NodeData
	if len(pi.NodesData) > 0 {
		previous = pi.NodesData[0]
	}
	local, err := GetLocalNodeData()
	if err != nil {
		return previous, err
	}
	local.NodeLabel = previous.NodeLabel
	pi.NodesData = []types.NodeData{local}

	for i := range pi.GarageInstances {
		pi.GarageInstances[i].NodeIP = local.NodeIP
	}
	if pi.GaragePendingMove != nil && pi.GaragePendingMove.ToIP != "" {
		pi.GaragePendingMove.ToIP = local.NodeIP
	}
	return previous, nil
}
