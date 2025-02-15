package docker

import (
	"fmt"

	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
)

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

func createNetwork(dc *DockerClient, swarmNetwork *Network) error {
	existingNetworks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing networks: %v", err)
	}

	networkExists := false
	for _, n := range existingNetworks {
		if n.Name == swarmNetwork.Name {
			networkExists = true
			break
		}
	}

	if !networkExists {
		net, err := dc.Cli.NetworkCreate(dc.Ctx, swarmNetwork.Name, network.CreateOptions{
			Driver:     swarmNetwork.Driver,
			Attachable: true,
			Labels: map[string]string{
				"app": "osi4iot",
			},
		})
		if err != nil {
			return fmt.Errorf("error creating network: %v", err)
		}
		swarmNetwork.Id = net.ID
	}

	return nil
}

func createSwarmNetworks(platformData *common.PlatformData, dc *DockerClient) (map[string]Network, error) {
	networks := GenerateNetworks(platformData)
	for _, network := range networks {
		err := createNetwork(dc, &network)
		if err != nil {
			return nil, fmt.Errorf("error creating network %s: %v", network.Name, err)
		}
	}

	return networks, nil
}

func removeSwarmNetworks(dc *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingNetworks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing networks: %v", err)
	}

	for _, n := range existingNetworks {
		err = dc.Cli.NetworkRemove(dc.Ctx, n.ID)
		if err != nil {
			return fmt.Errorf("error removing network: %v", err)
		}
	}

	return nil
}