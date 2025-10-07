package docker

import (
	"fmt"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

func nodesConfiguration(platformData *types.PlatformData) error {
	err := installUFWOnNodes(platformData)
	if err != nil {
		return fmt.Errorf("error installing UFW on nodes: %w", err)
	}

	err = installNFS(platformData)
	if err != nil {
		return fmt.Errorf("error installing NFS on nodes: %w", err)
	}

	err = installEFS(platformData)
	if err != nil {
		return fmt.Errorf("error installing EFS on nodes: %w", err)
	}

	err = addNodesLabels(platformData)
	if err != nil {
		return fmt.Errorf("error adding labels to nodes: %w", err)
	}

	return nil
}

func installUFWOnNodes(platformData *types.PlatformData) error {
	pi := platformData.PlatformInfo
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
		genericWorkerScript := `#!/bin/bash
REQUIRED_PKG="ufw"
if [ $(dpkg-query -W -f='${Status}' $REQUIRED_PKG 2>/dev/null | grep -c "ok installed") -eq 0 ];
then
	sudo apt-get update -y
	sudo apt-get install ufw -y
fi
ufw allow 22/tcp
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
			case "Generic org worker", "Exclusive org worker":
				nodeScript = utils.NodeScript{
					Node:   node,
					Script: genericWorkerScript,
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
		_, err := utils.RunScriptInNodes(platformData, nodeSripts)
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}

	return nil
}

func installNFS(platformData *types.PlatformData) error {
	pi := platformData.PlatformInfo
	deploymentLocation := pi.DeploymentLocation
	numSwarmNodes := len(pi.NodesData)

	if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Intalling NFS"
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

if [ ! -d /var/nfs_osi4iot/admin_api_log ]; then
	sudo mkdir /var/nfs_osi4iot/admin_api_log
	sudo chown nobody:nogroup /var/nfs_osi4iot/admin_api_log
fi

if [ ! -d /var/nfs_osi4iot/grafana_data ]; then
	sudo mkdir /var/nfs_osi4iot/grafana_data
	sudo chown nobody:nogroup /var/nfs_osi4iot/grafana_data
fi

if [ ! -d /var/nfs_osi4iot/mosquitto_data ]; then
	sudo mkdir /var/nfs_osi4iot/mosquitto_data
	sudo chown nobody:nogroup /var/nfs_osi4iot/mosquitto_data
fi

if [ ! -d /var/nfs_osi4iot/mosquitto_log ]; then
	sudo mkdir /var/nfs_osi4iot/mosquitto_log
	sudo chown nobody:nogroup /var/nfs_osi4iot/mosquitto_log
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
			_, err := utils.RunScriptInNodes(platformData, []utils.NodeScript{nodeScript})
			if err != nil {
				spinnerDone <- false
				return err
			}
			spinnerDone <- true
		}
	}

	return nil
}

func installEFS(platformData *types.PlatformData) error {
	pi := platformData.PlatformInfo
	deploymentLocation := pi.DeploymentLocation
	numSwarmNodes := len(pi.NodesData)

	if deploymentLocation == "AWS cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Installing EFS client"
		endMsg := "EFS client installed successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodeData := pi.NodesData[0]
		efsScript := `#!/bin/bash
export efs_dns=$1

if ! command -v mount.nfs &>/dev/null; then
    sudo apt-get update
    sudo apt-get install -y nfs-common
fi

if [ ! -d /home/ubuntu/efs_osi4iot ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot
    sudo mount -t nfs4 -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport $efs_dns:/ /home/ubuntu/efs_osi4iot
    sudo -E sh -c 'echo "$efs_dns:/ /home/ubuntu/efs_osi4iot nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0" >> /etc/fstab'
fi

if [ ! -d /home/ubuntu/efs_osi4iot/admin_api_log ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/admin_api_log
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/admin_api_log
fi

if [ ! -d /home/ubuntu/efs_osi4iot/grafana_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/grafana_data
    #sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/grafana_data
	sudo chown 472:472 /home/ubuntu/efs_osi4iot/grafana_data
fi

if [ ! -d /home/ubuntu/efs_osi4iot/mosquitto_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/mosquitto_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/mosquitto_data
fi

if [ ! -d /home/ubuntu/efs_osi4iot/mosquitto_log ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/mosquitto_log
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/mosquitto_log
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/portainer_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/portainer_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/portainer_data
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/pgadmin4_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/pgadmin4_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/pgadmin4_data
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/pgdata ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/pgdata
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/pgdata
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/timescaledb_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/timescaledb_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/timescaledb_data
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/s3_storage_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/s3_storage_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/s3_storage_data
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/minio_storage ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/minio_storage
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/minio_storage
fi

if [ ! -d  /home/ubuntu/efs_osi4iot/letsencrypt ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/letsencrypt
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/letsencrypt
fi
`
		efsDns := platformData.PlatformInfo.AwsEfsDNS
		nodeScript := utils.NodeScript{
			Node:   nodeData,
			Script: efsScript,
			Args:   []string{efsDns},
		}
		_, err := utils.RunScriptInNodes(platformData, []utils.NodeScript{nodeScript})
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}

	return nil
}

func addNodesLabels(platformData *types.PlatformData) error {
	pi := platformData.PlatformInfo
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

func removeEfsRootFolder(platformData *types.PlatformData) error {
	pi := platformData.PlatformInfo
	deploymentLocation := pi.DeploymentLocation
	numSwarmNodes := len(pi.NodesData)

	if deploymentLocation == "AWS cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Removing EFS root folder"
		endMsg := "EFS root folder removed successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodeData := pi.NodesData[0]
		efsScript := `#!/bin/bash
if [ -d /home/ubuntu/efs_osi4iot ]; then
	sudo rm -rf /home/ubuntu/efs_osi4iot/*
    sudo umount /home/ubuntu/efs_osi4iot
	sudo rm -rf /home/ubuntu/efs_osi4iot
	sudo sed -i '/efs_osi4iot nfs4 nfsvers=4.1/d' /etc/fstab
fi
`
		nodeScript := utils.NodeScript{
			Node:   nodeData,
			Script: efsScript,
			Args:   []string{},
		}
		_, err := utils.RunScriptInNodes(platformData, []utils.NodeScript{nodeScript})
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}
	return nil
}

func removeNfsRootFolder(platformData *types.PlatformData) error {
	pi := platformData.PlatformInfo
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
			_, err := utils.RunScriptInNodes(platformData, []utils.NodeScript{nodeScript})
			if err != nil {
				spinnerDone <- false
				return err
			}
			spinnerDone <- true
		}
	}

	return nil
}
