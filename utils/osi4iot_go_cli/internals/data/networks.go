package data

type Network struct {
	Id 	 string
	Name string
	Driver   string
}

func GenerateNetworks() map[string]Network {
	Networks := make(map[string]Network)
	deploymentMode := Data.PlatformInfo.DeploymentMode
	numNodes := len(Data.PlatformInfo.NodesData)

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