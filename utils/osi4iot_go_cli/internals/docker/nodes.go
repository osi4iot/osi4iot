package docker

import (
	"fmt"

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

func updateNodesData(dc *DockerClient, nodesData []common.NodeData) error {
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
		nodesData[i].NodeNanoCPUs = swarmNode.Description.Resources.NanoCPUs
		nodesData[i].NodeMemoryBytes = swarmNode.Description.Resources.MemoryBytes
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

func joinNodeToSwarm(dc *DockerClient, managerNode common.NodeData, joinToken string) error {
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

func joinAllNodesToSwarm(managerClient *DockerClient) error {
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
		err := joinNodeToSwarm(dc, managerClient.Node, token)
		if err != nil {
			return fmt.Errorf("error joining node to swarm: %w", err)
		}
	}
	return nil
}

func nodeLeaveSwarm(dc *DockerClient) error {
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
			err := nodeLeaveSwarm(dc)
			if err != nil {
				return fmt.Errorf("error leaving swarm in node %s: %v", node.NodeIP, err)
			}
		}
	}

	return nil
}

func getNodeRoleNumMap(platformData *common.PlatformData) map[string]int {
	roleNumMap := make(map[string]int)
	roleNumMap["Manager"] = 0
	roleNumMap["Platform worker"] = 0
	roleNumMap["Generic org worker"] = 0
	roleNumMap["Exclusive org worker"] = 0
	roleNumMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData

	for _, node := range nodesData {
		nodeRole := node.NodeRole
		switch nodeRole {
		case "Manager":
			roleNumMap["Manager"] += 1
		case "Platform worker":
			roleNumMap["Platform worker"] += 1
		case "Generic org worker":
			roleNumMap["Generic org worker"] += 1
		case "ExclusiveOrgWorker":
			roleNumMap["Exclusive org worker"] += 1
		case "NfsWorker":
			roleNumMap["NFS server"] += 1
		}
	}

	return roleNumMap
}

func getNodeNanoCpusMap(platformData *common.PlatformData) map[string]int64 {
	roleNanoCpusMap := make(map[string]int64)
	roleNanoCpusMap["Manager"] = 0
	roleNanoCpusMap["Platform worker"] = 0
	roleNanoCpusMap["Generic org worker"] = 0
	roleNanoCpusMap["Exclusive org worker"] = 0
	roleNanoCpusMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData

	for _, node := range nodesData {
		nodeRole := node.NodeRole
		switch nodeRole {
		case "Manager":
			if roleNanoCpusMap["Manager"] == 0 {
				roleNanoCpusMap["Manager"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["Manager"] {
				roleNanoCpusMap["Manager"] = node.NodeNanoCPUs
			}
		case "Platform worker":
			if roleNanoCpusMap["Platform worker"] == 0 {
				roleNanoCpusMap["Platform worker"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["Platform worker"] {
				roleNanoCpusMap["Platform worker"] = node.NodeNanoCPUs
			}
		case "Generic org worker":
			if roleNanoCpusMap["Generic org worker"] == 0 {
				roleNanoCpusMap["Generic org worker"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["Generic org worker"] {
				roleNanoCpusMap["Generic org worker"] = node.NodeNanoCPUs
			}
		case "ExclusiveOrgWorker":
			if roleNanoCpusMap["Exclusive org worker"] == 0 {
				roleNanoCpusMap["Exclusive org worker"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["Exclusive org worker"] {
				roleNanoCpusMap["Exclusive org worker"] = node.NodeNanoCPUs
			}
		case "NfsWorker":
			if roleNanoCpusMap["NFS server"] == 0 {
				roleNanoCpusMap["NFS server"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["NFS server"] {
				roleNanoCpusMap["NFS server"] = node.NodeNanoCPUs
			}

		}
	}

	return roleNanoCpusMap
}

func getNodeMemoryBytesMap(platformData *common.PlatformData) map[string]int64 {
	roleMemoryBytesMap := make(map[string]int64)
	roleMemoryBytesMap["Manager"] = 0
	roleMemoryBytesMap["Platform worker"] = 0
	roleMemoryBytesMap["Generic org worker"] = 0
	roleMemoryBytesMap["Exclusive org worker"] = 0
	roleMemoryBytesMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData

	for _, node := range nodesData {
		nodeRole := node.NodeRole
		switch nodeRole {
		case "Manager":
			if roleMemoryBytesMap["Manager"] == 0 {
				roleMemoryBytesMap["Manager"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["Manager"] {
				roleMemoryBytesMap["Manager"] = node.NodeMemoryBytes
			}
		case "Platform worker":
			if roleMemoryBytesMap["Platform worker"] == 0 {
				roleMemoryBytesMap["Platform worker"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["Platform worker"] {
				roleMemoryBytesMap["Platform worker"] = node.NodeMemoryBytes
			}
		case "Generic org worker":
			if roleMemoryBytesMap["Generic org worker"] == 0 {
				roleMemoryBytesMap["Generic org worker"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["Generic org worker"] {
				roleMemoryBytesMap["Generic org worker"] = node.NodeMemoryBytes
			}
		case "ExclusiveOrgWorker":
			if roleMemoryBytesMap["Exclusive org worker"] == 0 {
				roleMemoryBytesMap["Exclusive org worker"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["Exclusive org worker"] {
				roleMemoryBytesMap["Exclusive org worker"] = node.NodeMemoryBytes
			}
		case "NfsWorker":
			if roleMemoryBytesMap["NFS server"] == 0 {
				roleMemoryBytesMap["NFS server"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["NFS server"] {
				roleMemoryBytesMap["NFS server"] = node.NodeMemoryBytes
			}
		}
	}

	return roleMemoryBytesMap
}



