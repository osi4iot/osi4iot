package docker

import "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"

type Network struct {
	Id 	 string
	Name string
	Driver   string
}

func GenerateNetworks(platformData *common.PlatformData) map[string]Network {
	Networks := make(map[string]Network)
	deploymentMode := platformData.PlatformInfo.DeploymentMode
	numNodes := len(platformData.PlatformInfo.NodesData)

	Networks["traefik_public"] = Network{
		Name: "traefik_public",
		Driver: "overlay",
	}
	Networks["internal_net"] = Network{
		Name: "internal_net",
		Driver: "overlay",
	}

	if deploymentMode == "development" && numNodes > 1 {
		Networks["agent_network"] = Network{
			Name: "agent_network",
			Driver: "overlay",
		}
	}

	return Networks
}