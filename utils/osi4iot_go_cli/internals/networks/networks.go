package networks

import (
	"fmt"

	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func GenerateNetworks(platformData *pt.PlatformData) map[string]pt.Network {
	Networks := make(map[string]pt.Network)
	pi := platformData.PlatformInfo

	Networks["traefik_public"] = pt.Network{
		Name:   "traefik_public",
		Driver: "overlay",
	}
	Networks["internal_net"] = pt.Network{
		Name:   "internal_net",
		Driver: "overlay",
	}

	if pi.DeploymentMode == "development" && len(pi.NodesData) > 1 {
		Networks["agent_network"] = pt.Network{
			Name:   "agent_network",
			Driver: "overlay",
		}
	}

	Networks["nats_network"] = pt.Network{
		Name:   "nats_network",
		Driver: "overlay",
	}

	if pi.UsePatroniTool {
		// Dedicated overlay network for the Patroni clusters and HAProxy.
		// Keeps Raft (5010/5011), REST API (8008) and PostgreSQL (5432) traffic
		// isolated from the rest of the platform services.
		// HAProxy also joins internal_net so other services can reach it via
		// haproxy_patroni:5000/5001/5100/5101.
		Networks["patroni_net"] = pt.Network{
			Name:   "patroni_net",
			Driver: "overlay",
		}
	}

	return Networks
}

func createNetwork(dc *pt.DockerClient, swarmNetwork *pt.Network) (string, error) {
	existingNetworks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("error listing networks: %v", err)
	}

	for _, n := range existingNetworks {
		if n.Name == swarmNetwork.Name {
			return n.ID, nil
		}
	}

	net, err := dc.Cli.NetworkCreate(dc.Ctx, swarmNetwork.Name, network.CreateOptions{
		Driver:     swarmNetwork.Driver,
		Attachable: true,
		Labels: map[string]string{
			"app": "osi4iot",
		},
	})
	if err != nil {
		return "", fmt.Errorf("error creating network '%s': %v", swarmNetwork.Name, err)
	}

	return net.ID, nil
}

func CreateSwarmNetworks(platformData *pt.PlatformData, dc *pt.DockerClient) (map[string]pt.Network, error) {
	networksToCreate := GenerateNetworks(platformData)
	createdNetworks := make(map[string]pt.Network, len(networksToCreate))

	for key, network := range networksToCreate {
		id, err := createNetwork(dc, &network)
		if err != nil {
			return nil, fmt.Errorf("error creating network '%s': %v", network.Name, err)
		}
		network.ID = id
		createdNetworks[key] = network
	}

	return createdNetworks, nil
}

func RemoveSwarmNetworks(dc *pt.DockerClient) error {
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

func GetNetworkByName(dc *pt.DockerClient, networkName string) (*pt.Network, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("name", networkName)
	filterArgs.Add("label", "app=osi4iot")
	existingNetworks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing networks: %v", err)
	}

	if len(existingNetworks) == 0 {
		return nil, fmt.Errorf("network %s not found", networkName)
	}

	network := &pt.Network{
		ID:     existingNetworks[0].ID,
		Name:   existingNetworks[0].Name,
		Driver: existingNetworks[0].Driver,
	}

	return network, nil
}