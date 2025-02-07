package docker

import (
	"fmt"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/ui/tools"
)

func nodesConfiguration(platformData *common.PlatformData) error {
	err := installUFWOnNodes(platformData)
	if err != nil {
		return fmt.Errorf("error installing UFW on nodes: %w", err)
	}

	err = installNFS(platformData)
	if err != nil {
		return fmt.Errorf("error installing NFS on nodes: %w", err)
	}

	err = addNFSFolders(platformData)
	if err != nil {
		return fmt.Errorf("error adding NFS folders on nodes: %w", err)
	}

	err = installEFS(platformData)
	if err != nil {
		return fmt.Errorf("error installing EFS on nodes: %w", err)
	}

	err = addEfsFolders(platformData)
	if err != nil {
		return fmt.Errorf("error adding EFS folders on nodes: %w", err)
	}

	err = addNodesLabels(platformData)
	if err != nil {
		return fmt.Errorf("error adding labels to nodes: %w", err)
	}

	return nil
}

func installUFWOnNodes(platformData *common.PlatformData) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

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

		nodesData := platformData.PlatformInfo.NodesData
		nodeSripts := []tools.NodeScript{}
		for _, node := range nodesData {
			var nodeScript tools.NodeScript
			nodeRole := node.NodeRole
			if nodeRole == "Manager" {
				nodeScript = tools.NodeScript{
					Node:   node,
					Script: managerScript,
					Args:   []string{},
				}
			} else if nodeRole == "Platform worker" {
				nodeScript = tools.NodeScript{
					Node:   node,
					Script: platformWorkerScript,
					Args:   []string{},
				}
			} else if nodeRole == "Generic org worker" || nodeRole == "Exclusive org worker" {
				nodeScript = tools.NodeScript{
					Node:   node,
					Script: genericWorkerScript,
					Args:   []string{},
				}
			} else if nodeRole == "NFS server" {
				nodeScript = tools.NodeScript{
					Node:   node,
					Script: nfsScript,
					Args:   []string{},
				}
			}
			nodeSripts = append(nodeSripts, nodeScript)
		}
		_, err := tools.RunScriptInNodes(platformData, nodeSripts)
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}

	return nil
}

func installNFS(platformData *common.PlatformData) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

	if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Intalling NFS"
		endMsg := "NFS installed successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodesData := platformData.PlatformInfo.NodesData
		nfsNode := common.NodeData{}
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

			nodeScript := tools.NodeScript{
				Node:   nfsNode,
				Script: nfsScript,
				Args:   []string{ipsString},
			}
			_, err := tools.RunScriptInNodes(platformData, []tools.NodeScript{nodeScript})
			if err != nil {
				spinnerDone <- false
				return err
			}
			spinnerDone <- true
		}
	}

	return nil
}

func addNFSFolders(platformData *common.PlatformData) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

	if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Adding NFS folders."
		endMsg := "NFS folders added successfully."
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodesData := platformData.PlatformInfo.NodesData
		nfsNode := common.NodeData{}
		for _, node := range nodesData {
			if node.NodeRole == "NFS server" {
				nfsNode = node
				break
			}
		}

		organizations := platformData.Certs.MqttCerts.Organizations

		addNfsFoldersScript := `#!/bin/bash
org_acronym=$1
nri_hashes_array=($(echo "$2" | tr ',' '\n'))

for (( i=0; i < ${#nri_hashes_array[@]}; i++ )); do
    nri_folder="/var/nfs_osi4iot/org_${org_acronym}_nri_${nri_hashes_array[$i]}_data"
    if [ ! -d  $nri_folder ]; then
        sudo mkdir $nri_folder
        sudo chown nobody:nogroup $nri_folder
    fi
done

sudo systemctl restart nfs-kernel-server
`
		nodeScripts := []tools.NodeScript{}
		for _, org := range organizations {
			orgAcronym := org.OrgAcronym
			nriHashes := []string{}
			for _, nri := range org.NodeRedInstances {
				nriHashes = append(nriHashes, nri.NriHash)
			}
			nriHashesString := strings.Join(nriHashes, ",")
			nodeScript := tools.NodeScript{
				Node:   nfsNode,
				Script: addNfsFoldersScript,
				Args:   []string{orgAcronym, nriHashesString},
			}
			nodeScripts = append(nodeScripts, nodeScript)
		}
		_, err := tools.RunScriptInNodes(platformData, nodeScripts)
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}

	return nil
}

func RemoveNfsFolders(platformData *common.PlatformData, orgAcronym string) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

	if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := fmt.Sprintf("Removing NFS folders for organization %s", orgAcronym)
		endMsg := fmt.Sprintf("NFS folders removed successfully for organization %s", orgAcronym)
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodesData := platformData.PlatformInfo.NodesData
		nfsNode := common.NodeData{}
		for _, node := range nodesData {
			if node.NodeRole == "NFS server" {
				nfsNode = node
				break
			}
		}

		organizations := platformData.Certs.MqttCerts.Organizations
		orgToRemove := common.Organization{}
		for _, org := range organizations {
			if org.OrgAcronym == orgAcronym {
				orgToRemove = org
				break
			}
		}

		if orgToRemove.OrgAcronym != "" {
			orgAcronym := orgToRemove.OrgAcronym
			nriHashes := []string{}
			for _, nri := range orgToRemove.NodeRedInstances {
				nriHashes = append(nriHashes, nri.NriHash)
			}
			nriHashesString := strings.Join(nriHashes, ",")
			removeNfsFoldersScript := `#!/bin/bash
org_acronym=$1
nri_hashes_array=($(echo "$2" | tr ',' '\n'))

for (( i=0; i < ${#nri_hashes_array[@]}; i++ )); do
    nri_folder="/var/nfs_osi4iot/org_${org_acronym}_nri_${nri_hashes_array[$i]}_data"
    if [ -d  $nri_folder ]; then
        sudo rm -rf $nri_folder
    fi
done

sudo systemctl restart nfs-kernel-server		
`
			nodeScript := tools.NodeScript{
				Node:   nfsNode,
				Script: removeNfsFoldersScript,
				Args:   []string{orgAcronym, nriHashesString},
			}
			_, err := tools.RunScriptInNodes(platformData, []tools.NodeScript{nodeScript})
			if err != nil {
				spinnerDone <- false
				return err
			}
			spinnerDone <- true
		}
	}
	return nil
}

func installEFS(platformData *common.PlatformData) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

	if deploymentLocation == "AWS cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Creating EFS folders for platform services"
		endMsg := "EFS folders created successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodeData := platformData.PlatformInfo.NodesData[0]
		efsScript := `#!/bin/bash
efs_dns=$1

if [ ! -d /home/ubuntu/efs_osi4iot ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot
    echo "$efs_dns:/ /home/ubuntu/efs_osi4iot nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0" >> /etc/fstab
    sudo mount -a
fi

if [ ! -d /home/ubuntu/efs_osi4iot/admin_api_log ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/admin_api_log
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/admin_api_log
fi

if [ ! -d /home/ubuntu/efs_osi4iot/grafana_data ]; then
    sudo mkdir /home/ubuntu/efs_osi4iot/grafana_data
    sudo chown ubuntu:ubuntu /home/ubuntu/efs_osi4iot/grafana_data
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
`
		efsDns := platformData.PlatformInfo.AwsEfsDNS
		nodeScript := tools.NodeScript{
			Node:   nodeData,
			Script: efsScript,
			Args:   []string{efsDns},
		}
		_, err := tools.RunScriptInNodes(platformData, []tools.NodeScript{nodeScript})
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}

	return nil
}

func addEfsFolders(platformData *common.PlatformData) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

	if deploymentLocation == "AWS cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Adding EFS folders for organizations"
		endMsg := "EFS folders added successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodeData := platformData.PlatformInfo.NodesData[0]
		organizations := platformData.Certs.MqttCerts.Organizations

		addEfsFoldersScript := `#!/bin/bash
org_acronym=$1
nri_hashes_array=($(echo "$2" | tr ',' '\n'))

for (( i=0; i < ${#nri_hashes_array[@]}; i++ )); do
    nri_folder="/home/ubuntu/efs_osi4iot/org_${org_acronym}_nri_${nri_hashes_array[$i]}_data"
    if [ ! -d  $nri_folder ]; then
        sudo mkdir $nri_folder
        sudo chown ubuntu:ubuntu $nri_folder
    fi
done
`
		nodeScripts := []tools.NodeScript{}
		for _, org := range organizations {
			orgAcronym := org.OrgAcronym
			nriHashes := []string{}
			for _, nri := range org.NodeRedInstances {
				nriHashes = append(nriHashes, nri.NriHash)
			}
			nriHashesString := strings.Join(nriHashes, ",")
			nodeScript := tools.NodeScript{
				Node:   nodeData,
				Script: addEfsFoldersScript,
				Args:   []string{orgAcronym, nriHashesString},
			}
			nodeScripts = append(nodeScripts, nodeScript)
		}
		_, err := tools.RunScriptInNodes(platformData, nodeScripts)
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}

	return nil
}

func RemoveEfsFolders(platformData *common.PlatformData, orgAcronym string) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

	if deploymentLocation == "AWS cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := fmt.Sprintf("Removing EFS folders for organization %s", orgAcronym)
		endMsg := fmt.Sprintf("EFS folders removed successfully for organization %s", orgAcronym)
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodeData := platformData.PlatformInfo.NodesData[0]
		organizations := platformData.Certs.MqttCerts.Organizations
		orgToRemove := common.Organization{}
		for _, org := range organizations {
			if org.OrgAcronym == orgAcronym {
				orgToRemove = org
				break
			}
		}

		if orgToRemove.OrgAcronym != "" {
			orgAcronym := orgToRemove.OrgAcronym
			nriHashes := []string{}
			for _, nri := range orgToRemove.NodeRedInstances {
				nriHashes = append(nriHashes, nri.NriHash)
			}
			nriHashesString := strings.Join(nriHashes, ",")
			removeNfsFoldersScript := `#!/bin/bash
org_acronym=$1
nri_hashes_array=($(echo "$2" | tr ',' '\n'))

for (( i=0; i < ${#nri_hashes_array[@]}; i++ )); do
    nri_folder="/home/ubuntu/efs_osi4iot/org_${org_acronym}_nri_${nri_hashes_array[$i]}_data"
    if [ -d  $nri_folder ]; then
        sudo rm -rf $nri_folder
    fi
done		
`
			nodeScript := tools.NodeScript{
				Node:   nodeData,
				Script: removeNfsFoldersScript,
				Args:   []string{orgAcronym, nriHashesString},
			}
			_, err := tools.RunScriptInNodes(platformData, []tools.NodeScript{nodeScript})
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func filterOrganizations(organizations []common.Organization, nodeName string) *common.Organization {
	for _, org := range organizations {
		for _, node := range org.ExclusiveWorkerNodes {
			if node == nodeName {
				return &org
			}
		}
	}
	return nil
}

func addNodesLabels(platformData *common.PlatformData) error {
	spinnerDone := make(chan bool)
	spinnerMsg := "Adding node labels"
	endMsg := "Node labels added successfully"
	utils.Spinner(spinnerMsg, endMsg, spinnerDone)

	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
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

	nodesData := platformData.PlatformInfo.NodesData
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

		nodeName := node.NodeHostName
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
		case "Generic org worker":
			spec.Labels["generic_org_worker"] = "true"
		case "Exclusive org worker":
			organizations := platformData.Certs.MqttCerts.Organizations
			filteredOrg := filterOrganizations(organizations, nodeName)
			if filteredOrg != nil {
				spec.Labels["org_hash"] = filteredOrg.OrgHash
			}
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

func removeEfsRootFolder(platformData *common.PlatformData) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

	if deploymentLocation == "AWS cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Removing EFS root folder"
		endMsg := "EFS root folder removed successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodeData := platformData.PlatformInfo.NodesData[0]
		efsScript := `#!/bin/bash
if [ -d /home/ubuntu/efs_osi4iot ]; then
	sudo rm -rf /home/ubuntu/efs_osi4iot
fi
`
		nodeScript := tools.NodeScript{
			Node:   nodeData,
			Script: efsScript,
			Args:   []string{},
		}
		_, err := tools.RunScriptInNodes(platformData, []tools.NodeScript{nodeScript})
		if err != nil {
			spinnerDone <- false
			return err
		}
		spinnerDone <- true
	}
	return nil
}

func removeNfsRootFolder(platformData *common.PlatformData) error {
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	numSwarmNodes := len(platformData.PlatformInfo.NodesData)

	if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
		spinnerDone := make(chan bool)
		spinnerMsg := "Removing NFS root folder"
		endMsg := "NFS root folder removed successfully"
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		nodesData := platformData.PlatformInfo.NodesData
		nfsNode := common.NodeData{}
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
			nodeScript := tools.NodeScript{
				Node:   nfsNode,
				Script: nfsScript,
				Args:   []string{},
			}
			_, err := tools.RunScriptInNodes(platformData, []tools.NodeScript{nodeScript})
			if err != nil {
				spinnerDone <- false
				return err
			}
			spinnerDone <- true
		}
	}

	return nil
}
