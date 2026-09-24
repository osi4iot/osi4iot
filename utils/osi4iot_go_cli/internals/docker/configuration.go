package docker

import (
	"fmt"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
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
	usesPlacementLabels := resources.UsesPlacementLabels(pd)

	// Refused before anything is written. Labelling only the first two
	// of three replicas leaves the third pinned to a label nobody
	// carries, and that failure is invisible: the service simply sits
	// with a pending task.
	if err := resources.ValidatePlacement(pd); err != nil {
		spinnerDone <- false
		return err
	}

	natsReplica := 1
	adminReplica := 1
	metricsReplica := 1

	// Highest priority to the first manager, so the floating IP has a
	// deterministic holder. The list is extended rather than indexed
	// blindly: a fourth manager used to panic here.
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

		// Cleared on EVERY node and on every run, before anything is
		// assigned. Removing the last worker from a platform has to
		// remove its nats_1 and admin-id too, and a node that changed
		// role must not keep the labels of the role it had.
		for key := range spec.Labels {
			if strings.HasPrefix(key, "nats_") ||
				strings.HasPrefix(key, "admin-id") ||
				strings.HasPrefix(key, "metrics-id") {
				delete(spec.Labels, key)
			}
		}
		delete(spec.Labels, "platform_worker")

		switch node.NodeRole {
		case "Manager":
			priority := "0"
			if deploymentLocation == "On-premise cluster deployment" {
				priority = keepalivedPriority(priorityIndex)
				priorityIndex++
			}
			spec.Labels["KEEPALIVED_PRIORITY"] = priority

		case "Platform worker":
			spec.Labels["platform_worker"] = "true"

			// Skipped entirely when the platform pins nothing: with no
			// workers the services run on the managers unconstrained,
			// and with a local deployment there is one node running
			// everything. Writing the labels anyway would describe a
			// placement scheme nothing consults.
			if !usesPlacementLabels {
				break
			}

			spec.Labels[fmt.Sprintf("nats_%d", natsReplica)] = "true"
			natsReplica++

			if pi.UsePatroniTool && numPatroniAdminNodes > 1 && adminReplica <= numPatroniAdminNodes {
				spec.Labels["admin-id"] = fmt.Sprintf("%d", adminReplica)
				adminReplica++
			}
			if pi.UsePatroniTool && numPatroniMetricsNodes > 1 && metricsReplica <= numPatroniMetricsNodes {
				spec.Labels["metrics-id"] = fmt.Sprintf("%d", metricsReplica)
				metricsReplica++
			}
		}

		if err := docker.Cli.NodeUpdate(docker.Ctx, swarmNode.ID, swarmNode.Version, spec); err != nil {
			spinnerDone <- false
			return fmt.Errorf("error updating node %s: %w", node.NodeIP, err)
		}
	}

	spinnerDone <- true
	return nil
}

// keepalivedPriority returns the VRRP priority for the nth manager.
//
// Descending, so the first manager listed holds the floating IP in
// steady state and the others take over in order. Managers past the
// list get the lowest priority instead of an index out of range, which
// is what the old fixed three-element slice did with a fourth manager.
func keepalivedPriority(index int) string {
	priorities := []string{"300", "200", "100"}
	if index < len(priorities) {
		return priorities[index]
	}
	return "50"
}