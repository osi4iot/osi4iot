package docker

import (
	"fmt"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func nodesConfiguration(pd *types.PlatformData) error {
	err := installUFWOnNodes(pd)
	if err != nil {
		return fmt.Errorf("error installing UFW on nodes: %w", err)
	}

	err = installRexRayPlugin(pd)
	if err != nil {
		return fmt.Errorf("error installing RexRay plugin on nodes: %w", err)
	}

	err = addNodesLabels(pd)
	if err != nil {
		return fmt.Errorf("error adding labels to nodes: %w", err)
	}

	return nil
}

func installUFWOnNodes(pd *types.PlatformData) error {
	pi := pd.PlatformInfo
	deploymentLocation := pi.DeploymentLocation
	numSwarmNodes := len(pi.NodesData)

	if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Intalling UFW on nodes..."
		endMsg := "UFW installed on all nodes"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)

		managerScript := `#!/bin/bash
REQUIRED_PKG="ufw"
if [ $(dpkg-query -W -f='${Status}' $REQUIRED_PKG 2>/dev/null | grep -c "ok installed") -eq 0 ];
then
    sudo apt-get update -y
    sudo apt-get install ufw -y
fi
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2377/tcp
ufw allow 7946/tcp 
ufw allow 7946/udp 
ufw allow 4789/udp
sudo ufw enable
`
		platformWorkerScript := `#!/bin/bash
REQUIRED_PKG="ufw"
if [ $(dpkg-query -W -f='${Status}' $REQUIRED_PKG 2>/dev/null | grep -c "ok installed") -eq 0 ];
then
	sudo apt-get update -y
	sudo apt-get install ufw -y
fi
ufw allow 22/tcp
ufw allow 1883/tcp
ufw allow 8883/tcp
ufw allow 9001/tcp
ufw allow 2377/tcp
ufw allow 7946/tcp 
ufw allow 7946/udp 
ufw allow 4789/udp
sudo ufw enable
`

		nodesData := pi.NodesData
		nodeSripts := []utils.NodeScript{}
		for _, node := range nodesData {
			var nodeScript utils.NodeScript
			nodeRole := node.NodeRole
			switch nodeRole {
			case "Manager":
				nodeScript = utils.NodeScript{
					Node:   node,
					Script: managerScript,
					Args:   []string{},
				}
			case "Platform worker":
				nodeScript = utils.NodeScript{
					Node:   node,
					Script: platformWorkerScript,
					Args:   []string{},
				}
			}
			nodeSripts = append(nodeSripts, nodeScript)
		}
		_, err := utils.RunScriptInNodes(pd, nodeSripts)
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}

	return nil
}


func addNodesLabels(pd *types.PlatformData) error {
	pi := pd.PlatformInfo
	spinnerDone := make(chan bool)
	spinnerMsg := "Adding node labels"
	endMsg := "Node labels added successfully"
	utils.Spinner(spinnerMsg, endMsg, spinnerDone)

	deploymentLocation := pi.DeploymentLocation
	docker, err := GetManagerDC()
	if err != nil {
		spinnerDone <- false
		return fmt.Errorf("error getting docker client: %v", err)
	}

	swarmNodesMap, err := getSwarmNodesMap(docker)
	if err != nil {
		spinnerDone <- false
		return fmt.Errorf("error creating swarm nodes map: %w", err)
	}

	nodesData := pi.NodesData
	numManagerNodes := 0
	for _, node := range nodesData {
		if node.NodeRole == "Manager" {
			numManagerNodes++
		}
	}

	natsReplica := 1
	adminReplica := 1
	metricsReplica := 1
	priorities := []string{"300", "200", "100"}
	priorityIndex := 0

	numPatroniAdminNodes := utils.Max(pi.NumPatroniAdminNodes, 1)
	numPatroniMetricsNodes := utils.Max(pi.NumPatroniMetricsNodes, 1)

	for _, node := range nodesData {
		swarmNode, ok := swarmNodesMap[node.NodeIP]
		if !ok {
			continue
		}

		spec := swarmNode.Spec
		if spec.Labels == nil {
			spec.Labels = make(map[string]string)
		}

		nodeRole := node.NodeRole
		switch nodeRole {
		case "Manager":
			if deploymentLocation == "On-premise cluster deployment" && numManagerNodes > 0 {
				spec.Labels["KEEPALIVED_PRIORITY"] = priorities[priorityIndex]
				priorityIndex++
			}
			spec.Labels["KEEPALIVED_PRIORITY"] = "0"
		case "Platform worker":
			// Clean stale nats and patroni labels before reassigning
			for k := range spec.Labels {
				if strings.HasPrefix(k, "nats_") ||
					strings.HasPrefix(k, "admin-id") ||
					strings.HasPrefix(k, "metrics-id") {
					delete(spec.Labels, k)
				}
			}
			spec.Labels["platform_worker"] = "true"
			spec.Labels[fmt.Sprintf("nats_%d", natsReplica)] = "true"
			natsReplica++

			// Assign Patroni placement labels when UsePatroniTool is enabled
			// and the cluster has more than one node (single-node deployments
			// use no placement constraints — see patroniAdminPlacement).
			if pi.UsePatroniTool && numPatroniAdminNodes > 1 {
				if adminReplica <= numPatroniAdminNodes {
					spec.Labels["admin-id"] = fmt.Sprintf("%d", adminReplica)
					adminReplica++
				}
			}
			if pi.UsePatroniTool && numPatroniMetricsNodes > 1 {
				if metricsReplica <= numPatroniMetricsNodes {
					spec.Labels["metrics-id"] = fmt.Sprintf("%d", metricsReplica)
					metricsReplica++
				}
			}
		}

		err = docker.Cli.NodeUpdate(docker.Ctx, swarmNode.ID, swarmNode.Version, spec)
		if err != nil {
			spinnerDone <- false
			return fmt.Errorf("error updating node %s: %w", node.NodeIP, err)
		}
	}

	spinnerDone <- true
	return nil
}
