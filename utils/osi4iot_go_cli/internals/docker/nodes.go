package docker

import (
	"fmt"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/swarm"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

func getSwarmNodesMap(dc *pt.DockerClient) (map[string]swarm.Node, error) {
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

func updateNodesData(dc *pt.DockerClient, nodesData *[]pt.NodeData) error {
    swarmNodesMap, err := getSwarmNodesMap(dc)
    if err != nil {
        return fmt.Errorf("error creating swarm nodes map: %w", err)
    }
    for i, node := range *nodesData {
        swarmNode, ok := swarmNodesMap[node.NodeIP]
        if !ok {
            continue
        }
        (*nodesData)[i].NodeId = swarmNode.ID
        (*nodesData)[i].NodeHostName = swarmNode.Description.Hostname
        (*nodesData)[i].NodeArch = swarmNode.Description.Platform.Architecture
        (*nodesData)[i].NodeNanoCPUs = swarmNode.Description.Resources.NanoCPUs
        (*nodesData)[i].NodeMemoryBytes = swarmNode.Description.Resources.MemoryBytes
    }
    return nil
}

func GetManagerDC() (*pt.DockerClient, error) {
	for _, dc := range pt.DCMap {
		// SetDockerClientsMap stores a nil entry for every node it
		// couldn't reach, so this dereference panicked whenever any node
		// was down — including on the read-only commands that only need
		// SOME manager.
		if dc == nil {
			continue
		}
		if dc.Node.NodeRole == "Manager" {
			return dc, nil
		}
	}

	return nil, fmt.Errorf("error getting manager docker client")
}

func joinNodeToSwarm(dc *pt.DockerClient, managerNode pt.NodeData, joinToken string) error {
	remoteAddr := fmt.Sprintf("%s:2377", managerNode.NodeIP)
	joinRequest := swarm.JoinRequest{
		ListenAddr:    "0.0.0.0:2377",
		RemoteAddrs:   []string{remoteAddr},
		JoinToken:     joinToken,
		AdvertiseAddr: dc.Node.NodeIP,
	}

	if err := dc.Cli.SwarmJoin(dc.Ctx, joinRequest); err != nil {
		return fmt.Errorf("error joining node with IP %s to swarm: %v", dc.Node.NodeIP, err)
	}

	return nil
}

func joinAllNodesToSwarm(managerClient *pt.DockerClient) error {
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

	for ip, dc := range pt.DCMap {
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

// How nodeLeaveSwarm retries, as variables so its tests run fast.
var (
	swarmLeaveAttempts  = 4
	swarmLeaveRetryWait = 5 * time.Second
)

// nodeLeaveSwarm makes the node behind dc leave its swarm.
//
// Leaving can fail on the daemon's side with "context deadline
// exceeded": the daemon gives its swarm component a fixed time to stop,
// and when that runs over — networks still being detached from tasks
// just moved away, say — it gives up before clearing the node's swarm
// state. Asking again a few seconds later normally works. So: nothing
// to do if the node is no longer in a swarm (the failed attempt may
// have finished after all), otherwise ask again, checking the node's
// real state after each attempt.
func nodeLeaveSwarm(dc *pt.DockerClient) error {
	var lastErr error
	for attempt := 1; attempt <= swarmLeaveAttempts; attempt++ {
		if left, err := nodeOutOfSwarm(dc); err == nil && left {
			return nil
		}
		lastErr = dc.Cli.SwarmLeave(dc.Ctx, true)
		if lastErr == nil {
			return nil
		}
		if attempt < swarmLeaveAttempts {
			time.Sleep(swarmLeaveRetryWait)
		}
	}
	if left, err := nodeOutOfSwarm(dc); err == nil && left {
		return nil
	}
	return fmt.Errorf("error leaving swarm after %d attempts: %v. Run the same command again "+
		"(it carries on from here), or run 'docker swarm leave --force' on the node", swarmLeaveAttempts, lastErr)
}

// nodeOutOfSwarm reports whether the node's daemon says it is in no swarm.
func nodeOutOfSwarm(dc *pt.DockerClient) (bool, error) {
	info, err := dc.Cli.Info(dc.Ctx)
	if err != nil {
		return false, err
	}
	return info.Swarm.LocalNodeState == swarm.LocalNodeStateInactive, nil
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

	for ip, dc := range pt.DCMap {
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

func GetNodeRoleNumMap(platformData *pt.PlatformData) map[string]int {
	roleNumMap := make(map[string]int)
	roleNumMap["Manager"] = 0
	roleNumMap["Platform worker"] = 0
	nodesData := platformData.PlatformInfo.NodesData

	for _, node := range nodesData {
		nodeRole := node.NodeRole
		switch nodeRole {
		case "Manager":
			roleNumMap["Manager"] += 1
		case "Platform worker":
			roleNumMap["Platform worker"] += 1
		}
	}

	return roleNumMap
}

func GetNodeNanoCpusMap(platformData *pt.PlatformData) map[string]int64 {
	roleNanoCpusMap := make(map[string]int64)
	roleNanoCpusMap["Manager"] = 0
	roleNanoCpusMap["Platform worker"] = 0
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

		}
	}

	return roleNanoCpusMap
}
