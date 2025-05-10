package volumes

import (
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/errdefs"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

func NriVolumesDataMap(platformData *pt.PlatformData, newOrg pt.Organization) map[string]pt.Volume {
	orgAcronym := strings.ToLower(newOrg.OrgAcronym)
	nriVolumesData := make(map[string]pt.Volume)

	for _, nri := range newOrg.NodeRedInstances {
		nriHash := nri.NriHash
		serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
		volumeName := fmt.Sprintf("%s_data", serviceName)
		nriVolume := pt.Volume{
			Name:       volumeName,
			Driver:     "local",
			DriverOpts: map[string]string{},
		}

		nodesData := platformData.PlatformInfo.NodesData
		numSwarmNodes := len(nodesData)
		deploymentLocation := platformData.PlatformInfo.DeploymentLocation
		if deploymentLocation == "On-premise cluster deployment" && numSwarmNodes > 1 {
			nfsServerIP := ""
			for _, node := range nodesData {
				if node.NodeRole == "NFS Server" {
					nfsServerIP = node.NodeIP
					break
				}
			}

			driverOptsO := fmt.Sprintf("nfsvers=4,addr=%s,rw", nfsServerIP)
			nriVolume.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": fmt.Sprintf(":/var/nfs_osi4iot/%s", volumeName),
			}
		} else if deploymentLocation == "AWS cluster deployment" && numSwarmNodes > 1 {
			awsEfsDNS := platformData.PlatformInfo.AwsEfsDNS
			driverOptsO := fmt.Sprintf("addr=%s,nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport", awsEfsDNS)
			serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
			volumeName := fmt.Sprintf("%s_data", serviceName)
			nriVolume.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": fmt.Sprintf("%s:/%s", awsEfsDNS, volumeName),
			}
		}
		nriVolumesData[volumeName] = nriVolume
	}

	return nriVolumesData
}

func RemoveNriVolumesInOrg(org pt.Organization) error {
	orgAcronym := strings.ToLower(org.OrgAcronym)
	volumeNames := []string{}
	numNodeRedInstances := len(org.NodeRedInstances)
	for inri := range numNodeRedInstances {
		nriHash := org.NodeRedInstances[inri].NriHash
		serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
		nriVolumeName := fmt.Sprintf("%s_data", serviceName)
		volumeNames = append(volumeNames, nriVolumeName)
	}

	nriVolumeFilters := filters.NewArgs()
	for _, name := range volumeNames {
		nriVolumeFilters.Add("name", name)
	}

	done := make(chan bool)
	spinnerMsg := fmt.Sprintf("Removing nri volumes in organization %s", org.OrgAcronym)
	endMsg := fmt.Sprintf("Nri volumes in organization %s have been removed successfully", org.OrgAcronym)
	utils.Spinner(spinnerMsg, endMsg, done)

	timeOut := false
	for i := 0; i <= 60; i++ {
		time.Sleep(1 * time.Second) // wait for containers to stop completely
		errors := []error{}
		for _, dc := range pt.DCMap {
			existingVolumes := make(map[string]*volume.Volume)
			volumesByNameResp, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{
				Filters: nriVolumeFilters,
			})
			if err != nil {
				return fmt.Errorf("error listing volumes by name: %v", err)
			}
			for _, v := range volumesByNameResp.Volumes {
				existingVolumes[v.Name] = v
			}

			for _, v := range existingVolumes {
				err = dc.Cli.VolumeRemove(dc.Ctx, v.Name, true)
				if err != nil {
					if errdefs.IsNotFound(err) {
						continue
					}
					errors = append(errors, fmt.Errorf("error removing nri volume: %v", err))
				}
			}
		}

		if len(errors) == 0 {
			break
		}

		if i == 60 {
			timeOut = true
		}
	}

	if timeOut {
		done <- false
		return fmt.Errorf("timeout removing nri volumes in organization %s", org.OrgAcronym)
	}

	done <- true

	return nil
}
