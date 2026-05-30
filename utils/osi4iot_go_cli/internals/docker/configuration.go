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

	err = installNFS(pd)
	if err != nil {
		return fmt.Errorf("error installing NFS on nodes: %w", err)
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
		nfsScript := `#!/bin/bash
REQUIRED_PKG="ufw"
if [ $(dpkg-query -W -f='${Status}' $REQUIRED_PKG 2>/dev/null | grep -c "ok installed") -eq 0 ];
then
	sudo apt-get update -y
	sudo apt-get install ufw -y
fi
ufw allow 22/tcp
ufw allow 2049/tcp
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
			case "NFS server":
				nodeScript = utils.NodeScript{
					Node:   node,
					Script: nfsScript,
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

func installNFS(pd *types.PlatformData) error {
	pi := pd.PlatformInfo
	deploymentLocation := pi.DeploymentLocation
	numSwarmNodes := len(pi.NodesData)

	if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Installing NFS"
		endMsg := "NFS installed successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodesData := pi.NodesData
		nfsNode := types.NodeData{}
		for _, node := range nodesData {
			if node.NodeRole == "NFS server" {
				nfsNode = node
				break
			}
		}
		if nfsNode.NodeIP != "" {
			nfsScript := `#!/bin/bash
ips_array=($(echo "$1" | tr ',' '\n'))

REQUIRED_PKG="nfs-kernel-server"
if [ $(dpkg-query -W -f='${Status}' $REQUIRED_PKG 2>/dev/null | grep -c "ok installed") -eq 0 ];
then
	sudo apt-get update -y
	sudo apt-get install nfs-kernel-server -y
fi

if [ ! -d /var/nfs_osi4iot ]; then
	sudo mkdir /var/nfs_osi4iot
	sudo chown nobody:nogroup /var/nfs_osi4iot
fi

if [ ! -d /var/nfs_osi4iot/grafana_data ]; then
	sudo mkdir /var/nfs_osi4iot/grafana_data
	sudo chown nobody:nogroup /var/nfs_osi4iot/grafana_data
fi

if [ ! -d  /var/nfs_osi4iot/portainer_data ]; then
	sudo mkdir /var/nfs_osi4iot/portainer_data
	sudo chown nobody:nogroup /var/nfs_osi4iot/portainer_data
fi

if [ ! -d  /var/nfs_osi4iot/pgadmin4_data ]; then
	sudo mkdir /var/nfs_osi4iot/pgadmin4_data
	sudo chown nobody:nogroup /var/nfs_osi4iot/pgadmin4_data
fi

if [ ! -d  /var/nfs_osi4iot/pgdata ]; then
	sudo mkdir /var/nfs_osi4iot/pgdata
	sudo chown nobody:nogroup /var/nfs_osi4iot/pgdata
fi

if [ ! -d  /var/nfs_osi4iot/timescaledb_data ]; then
	sudo mkdir /var/nfs_osi4iot/timescaledb_data
	sudo chown nobody:nogroup /var/nfs_osi4iot/timescaledb_data
fi

if [ ! -d  /var/nfs_osi4iot/portainer_data ]; then
	sudo mkdir /var/nfs_osi4iot/portainer_data
	sudo chown nobody:nogroup /var/nfs_osi4iot/portainer_data
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/letsencrypt ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/letsencrypt
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/letsencrypt
fi

for (( i=0; i<${#ips_array[@]}; i++ )); do
	newline="/var/nfs_osi4iot ${ips_array[$i]}(rw,sync,no_root_squash,no_subtree_check)"
	if ! grep -Fxq "$newline" "/etc/exports"; then
		echo $newline >> /etc/exports
	fi
done

sudo systemctl restart nfs-kernel-server
`
			var ips []string
			for _, node := range nodesData {
				if node.NodeRole != "NFS server" {
					ips = append(ips, node.NodeIP)
				}
			}
			ipsString := strings.Join(ips, ",")

			nodeScript := utils.NodeScript{
				Node:   nfsNode,
				Script: nfsScript,
				Args:   []string{ipsString},
			}
			_, err := utils.RunScriptInNodes(pd, []utils.NodeScript{nodeScript})
			if err != nil {
				spinnerDone <- false
				return err
			}
			spinnerDone <- true
		}
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
	priorities := []string{"300", "200", "100"}
	priorityIndex := 0
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
			spec.Labels["platform_worker"] = "true"
		case "NFS server":
			spec.Labels["nfs_server"] = "true"
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

func removeNfsRootFolder(pd *types.PlatformData) error {
	pi := pd.PlatformInfo
	deploymentLocation := pi.DeploymentLocation
	numSwarmNodes := len(pi.NodesData)

	if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Removing NFS root folder"
		endMsg := "NFS root folder removed successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodesData := pi.NodesData
		nfsNode := types.NodeData{}
		for _, node := range nodesData {
			if node.NodeRole == "NFS server" {
				nfsNode = node
				break
			}
		}
		if nfsNode.NodeIP != "" {
			nfsScript := `#!/bin/bash
if [ -d /var/nfs_osi4iot ]; then
	sudo rm -rf /var/nfs_osi4iot
fi
`
			nodeScript := utils.NodeScript{
				Node:   nfsNode,
				Script: nfsScript,
				Args:   []string{},
			}
			_, err := utils.RunScriptInNodes(pd, []utils.NodeScript{nodeScript})
			if err != nil {
				spinnerDone <- false
				return err
			}
			spinnerDone <- true
		}
	}

	return nil
}
