package volumes

import (
	"fmt"

	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/errdefs"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

type VolumeOptions struct {
	driverOptsO string
	awsEfsDNS   string
}

func createDefalutOptions(pi pt.PlatformInfo) VolumeOptions {
	deploymentLocation := pi.DeploymentLocation
	driverOptsO := ""
	nodesData := pi.NodesData
	awsEfsDNS := ""
	if deploymentLocation == "On-premise cluster deployment" && len(nodesData) > 1 {
		nfsServerIP := ""
		for _, node := range nodesData {
			if node.NodeRole == "NFS Server" {
				nfsServerIP = node.NodeIP
				break
			}
		}
		driverOptsO = fmt.Sprintf("nfsvers=4,addr=%s,rw", nfsServerIP)
	} else if deploymentLocation == "AWS cluster deployment" && len(nodesData) > 1 {
		driverOptsO = fmt.Sprintf("addr=%s,nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport", awsEfsDNS)
		awsEfsDNS = pi.AwsEfsDNS
	}
	volOptions := VolumeOptions{
		driverOptsO: driverOptsO,
		awsEfsDNS:   awsEfsDNS,
	}
	return volOptions
}

func GenerateVolumes(platformData *pt.PlatformData) map[string]pt.Volume {
	Volumes := make(map[string]pt.Volume)
	pi := platformData.PlatformInfo

	deploymentLocation := pi.DeploymentLocation
	deploymentMode := pi.DeploymentMode
	s3BucketType := pi.S3BucketType
	domainCertsType := pi.DomainCertsType

	volOptions := createDefalutOptions(pi)
	if domainCertsType[0:19] == "Let's encrypt certs" {
		Volumes["letsencrypt"] = SetVolumeConfig("letsencrypt", deploymentLocation, volOptions)
	}

	numNatsReplicas := utils.GetServiceReplicas(platformData, "nats")
	for replica := 1; replica <= numNatsReplicas; replica++ {
		volumeName := fmt.Sprintf("nats%d_data", replica)
		Volumes[volumeName] = SetVolumeConfig(volumeName, deploymentLocation, volOptions)
	}

	Volumes["pgdata"] = SetVolumeConfig("pgdata", deploymentLocation, volOptions)
	Volumes["grafana_data"] = SetVolumeConfig("grafana_data", deploymentLocation, volOptions)
	Volumes["timescaledb_data"] = SetVolumeConfig("timescaledb_data", deploymentLocation, volOptions)
	Volumes["timescaledb_wal"] = SetVolumeConfig("timescaledb_wal", deploymentLocation, volOptions)
	Volumes["admin_api_log"] = SetVolumeConfig("admin_api_log", deploymentLocation, volOptions)

	numPipelinesReplicas := utils.GetServiceReplicas(platformData, "pipelines")
	for i := 1; i <= numPipelinesReplicas; i++ {
		volName := fmt.Sprintf("pipelines_data_%d", i)
		Volumes[volName] = SetVolumeConfig(volName, deploymentLocation, volOptions)
	}

	if deploymentMode == "development" {
		Volumes["portainer_data"] = SetVolumeConfig("portainer_data", deploymentLocation, volOptions)
		Volumes["pgadmin4_data"] = SetVolumeConfig("pgadmin4_data", deploymentLocation, volOptions)
	}

	if s3BucketType == "Local Minio" {
		Volumes["minio_storage"] = SetVolumeConfig("minio_storage", deploymentLocation, volOptions)
	}

	return Volumes
}

func CreateVolume(dc *pt.DockerClient, swarmVol *pt.Volume) error {
	existingVolumes, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing volumes: %v", err)
	}

	volumeExists := false
	for _, v := range existingVolumes.Volumes {
		if v.Name == swarmVol.Name {
			swarmVol.ID = v.Name
			volumeExists = true
			break
		}
	}

	if !volumeExists {
		vol, err := dc.Cli.VolumeCreate(dc.Ctx, volume.CreateOptions{
			Name:       swarmVol.Name,
			Driver:     swarmVol.Driver,
			DriverOpts: swarmVol.DriverOpts,
			Labels: map[string]string{
				"app": "osi4iot",
			},
		})
		if err != nil {
			return fmt.Errorf("error creating volume: %v", err)
		}
		swarmVol.ID = vol.Name
	}

	return nil
}

func CreateSwarmVolumes(pd *pt.PlatformData, volumesMap map[string]pt.Volume) (map[string]pt.Volume, error) {
	numNodes := len(pd.PlatformInfo.NodesData)
	errors := []error{}
	for _, dc := range pt.DCMap {
		var filteredVolumes map[string]pt.Volume
		if numNodes == 1 {
			filteredVolumes = volumesMap
		} else {
			filteredVolumes = getVolumesMapByNodeRole(volumesMap, dc.Node.NodeRole, pd)
		}

		for key, volume := range filteredVolumes {
			err := CreateVolume(dc, &volume)
			if err != nil {
				errors = append(errors, fmt.Errorf("error creating volume %s in node %s: %v", volume.Name, dc.Node.NodeIP, err))
			}
			volumesMap[key] = volume
		}
	}

	if len(errors) > 0 {
		return nil, fmt.Errorf("errors creating volumes: %v", errors)
	}

	return volumesMap, nil
}

func RemoveSwarmVolumes(pd *pt.PlatformData) error {
	errors := []error{}
	filterByNames := getVolumeFilterByNames(pd)

	for _, dc := range pt.DCMap {
		existingVolumes := make(map[string]*volume.Volume)
		volumesByNameResp, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{
			Filters: filterByNames,
		})
		if err != nil {
			return fmt.Errorf("error listing volumes by name: %v", err)
		}
		for _, v := range volumesByNameResp.Volumes {
			existingVolumes[v.Name] = v
		}

		filterByLabel := filters.NewArgs()
		filterByLabel.Add("label", "app=osi4iot")
		volumesByLabelResp, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{
			Filters: filterByLabel,
		})
		if err != nil {
			return fmt.Errorf("error listing volumes by label: %v", err)
		}
		for _, v := range volumesByLabelResp.Volumes {
			if _, ok := existingVolumes[v.Name]; !ok {
				existingVolumes[v.Name] = v
			}
		}

		for _, v := range existingVolumes {
			err = dc.Cli.VolumeRemove(dc.Ctx, v.Name, true)
			if err != nil {
				if errdefs.IsNotFound(err) {
					continue
				}
				errors = append(errors, fmt.Errorf("error removing volume: %v", err))
			}
		}

	}

	if len(errors) > 0 {
		return fmt.Errorf("errors removing volumes: %v", errors)
	}

	return nil
}

func getVolumeFilterByNames(pd *pt.PlatformData) filters.Args {
	volumeNames := []string{
		"letsencrypt",
		"pgdata",
		"grafana_data",
		"timescaledb_data",
		"admin_api_log",
		"portainer_data",
		"pgadmin4_data",
		"minio_storage",
	}
	numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
	for replica := 1; replica <= numNatsReplicas; replica++ {
		volName := fmt.Sprintf("nats%d_data", replica)
		volumeNames = append(volumeNames, volName)
	}

	volumeFilters := filters.NewArgs()
	for _, name := range volumeNames {
		volumeFilters.Add("name", name)
	}

	return volumeFilters
}

func getVolumesMapByNodeRole(volumesMap map[string]pt.Volume, nodeRole string, pd *pt.PlatformData) map[string]pt.Volume {
	volumeNames := []string{}
	switch nodeRole {
	case "Manager":
		volumeNames = append(volumeNames,
			"letsencrypt",
			"grafana_data",
		)
	case "Platform worker":
		volumeNames = append(volumeNames,
			"pgdata",
			"timescaledb_data",
			"admin_api_log",
			"portainer_data",
			"pgadmin4_data",
			"minio_storage",
		)
		numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
		for replica := 1; replica <= numNatsReplicas; replica++ {
			volName := fmt.Sprintf("nats%d_data", replica)
			volumeNames = append(volumeNames, volName)
		}

	case "NfsWorker":
		//no code
	}

	filteredVolumes := make(map[string]pt.Volume)
	for _, name := range volumeNames {
		filteredVolumes[name] = volumesMap[name]
	}

	return filteredVolumes
}

func SetVolumeConfig(volumeName string, deploymentLocation string, volOpts VolumeOptions) pt.Volume {
	vol := pt.Volume{
		Name:       volumeName,
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	switch deploymentLocation {
	case "On-premise cluster deployment":
		vol.Driver = "nfs"
		vol.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      volOpts.driverOptsO,
			"device": fmt.Sprintf(":/var/nfs_osi4iot/%s", volumeName),
		}
	case "AWS cluster deployment":
		vol.Driver = "nfs"
		vol.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      volOpts.driverOptsO,
			"device": fmt.Sprintf("%s:/%s", volOpts.awsEfsDNS, volumeName),
		}
	}

	return vol
}

func CreateNatsVolume(pi pt.PlatformInfo, dc *pt.DockerClient, replica int) (*pt.Volume, error) {
	volOptions := createDefalutOptions(pi)
	volumeName := fmt.Sprintf("nats%d_data", replica)
	volume := SetVolumeConfig(volumeName, pi.DeploymentLocation, volOptions)
	err := CreateVolume(dc, &volume)
	if err != nil {
		return nil, fmt.Errorf("error creating volume %s in node %s: %v", volume.Name, dc.Node.NodeIP, err)
	}

	return &volume, nil
}

func RemoveNatsVolume(dc *pt.DockerClient, replica int) error {
	volumeName := fmt.Sprintf("nats%d_data", replica)
	err := dc.Cli.VolumeRemove(dc.Ctx, volumeName, true)
	if err != nil {
		if errdefs.IsNotFound(err) {
			return nil
		}
		return fmt.Errorf("error removing volume: %v", err)
	}
	return nil
}

func CreatePipelinesVolume(pi pt.PlatformInfo, dc *pt.DockerClient, replica int) error {
	volOptions := createDefalutOptions(pi)
	volumeName := fmt.Sprintf("pipelines_data_%d", replica)
	volume := SetVolumeConfig(volumeName, pi.DeploymentLocation, volOptions)
	err := CreateVolume(dc, &volume)
	if err != nil {
		return fmt.Errorf("error creating volume %s in node %s: %v", volume.Name, dc.Node.NodeIP, err)
	}

	return nil
}

func RemovePipelinesVolume(dc *pt.DockerClient, replica int) error {
	volumeName := fmt.Sprintf("pipelines_data_%d", replica)
	err := dc.Cli.VolumeRemove(dc.Ctx, volumeName, true)
	if err != nil {
		if errdefs.IsNotFound(err) {
			return nil
		}
		return fmt.Errorf("error removing volume: %v", err)
	}
	return nil
}
