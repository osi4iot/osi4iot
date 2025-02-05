package docker

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
)

func getSwarmNodesMap(dc *DockerClient) (map[string]swarm.Node, error) {
	swarmNodes, err := dc.Cli.NodeList(dc.Ctx, types.NodeListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing swarm nodes: %w", err)
	}

	swarmNodesMap := make(map[string]swarm.Node)
	for _, swarmNode := range swarmNodes {
		swarmNodesMap[swarmNode.Status.Addr] = swarmNode
	}
	return swarmNodesMap, nil
}

func UpdateNodesData(dc *DockerClient, nodesData []common.NodeData) error {
	swarmNodesMap, err := getSwarmNodesMap(dc)
	if err != nil {
		return fmt.Errorf("error creating swarm nodes map: %w", err)
	}

	for i, node := range nodesData {
		swarmNode, ok := swarmNodesMap[node.NodeIP]
		if !ok {
			continue
		}
		nodesData[i].NodeId = swarmNode.ID
		nodesData[i].NodeHostName = swarmNode.Description.Hostname
		nodesData[i].NodeArch = swarmNode.Description.Platform.Architecture
	}
	return nil
}

func GetLocalNodeData() (common.NodeData, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return common.NodeData{}, err
	}

	usr, err := user.Current()
	if err != nil {
		return common.NodeData{}, err
	}

	cmd := exec.Command("uname", "-m")
	output, err := cmd.Output()
	if err != nil {
		return common.NodeData{}, err
	}
	nodeArch := strings.TrimSpace(string(output))

	nodeData := common.NodeData{
		NodeHostName: hostname,
		NodeIP:       "localhost",
		NodeUserName: usr.Username,
		NodeRole:     "Manager",
		NodeArch:     nodeArch,
	}
	return nodeData, nil
}

func JoinNodeToSwarm(dc *DockerClient, managerNode common.NodeData, joinToken string) error {
	remoteAddr := fmt.Sprintf("%s:2377", managerNode.NodeIP)
	joinRequest := swarm.JoinRequest{
		ListenAddr: "0.0.0.0:2377",
		RemoteAddrs: []string{remoteAddr},
		JoinToken:  joinToken,
		AdvertiseAddr: dc.Node.NodeIP, 
	}

	if err := dc.Cli.SwarmJoin(dc.Ctx, joinRequest); err != nil {
		return fmt.Errorf("error joining node with IP %s to swarm: %v", dc.Node.NodeIP, err)
	}
	
	return nil
}

func GetManagerDC() (*DockerClient, error) {
	for _, dc := range DCMap {
		if dc.Node.NodeRole == "Manager" {
			return dc, nil
		}
	}

	return nil, fmt.Errorf("error getting manager docker client")
}

func JoinAllNodesToSwarm(platformData *common.PlatformData, managerClient *DockerClient) error {
	swarmInfo, err := managerClient.Cli.SwarmInspect(managerClient.Ctx)
	if err != nil {
		return fmt.Errorf("error inspecting the Swarm: %v", err)
	}
	tokenWorker := swarmInfo.JoinTokens.Worker
	tokenManager := swarmInfo.JoinTokens.Manager

	swarmNodesMap, err := getSwarmNodesMap(managerClient)
	if err != nil {
		return fmt.Errorf("error creating swarm nodes map: %w", err)
	}

	for ip, dc := range DCMap {
		node := dc.Node
		_, ok := swarmNodesMap[ip]
		if ok {
			continue
		}

		token := tokenWorker
		if node.NodeRole == "Manager" {
			token = tokenManager
		}
		fmt.Printf("Joining node with IP: %s to the swarm\n", node.NodeIP)
		err := JoinNodeToSwarm(dc, managerClient.Node, token)
		if err != nil {
			return fmt.Errorf("error joining node to swarm: %w", err)
		}
	}
	return nil
}

func NodeLeaveSwarm(dc *DockerClient) error {
	err := dc.Cli.SwarmLeave(dc.Ctx, true)
	if err != nil {
		return fmt.Errorf("error leaving swarm: %v", err)
	}

	return nil
}

func nodesLeaveSwarm() error {
	managerClient, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting manager docker client: %v", err)
	}

	swarmNodesMap, err := getSwarmNodesMap(managerClient)
	if err != nil {
		return fmt.Errorf("error creating swarm nodes map: %w", err)
	}

	for ip, dc := range DCMap {
		node := dc.Node
		_, ok := swarmNodesMap[ip]
		if ok {
			err := NodeLeaveSwarm(dc)
			if err != nil {
				return fmt.Errorf("error leaving swarm in node %s: %v", node.NodeIP, err)
			}
		}
	}

	return nil
}

