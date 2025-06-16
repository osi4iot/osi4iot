package volumes

import (
	"fmt"
	"strings"

	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/errdefs"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func GenerateVolumes(platformData *pt.PlatformData) map[string]pt.Volume {
	Volumes := make(map[string]pt.Volume)
	pi := platformData.PlatformInfo

	deploymentLocation := pi.DeploymentLocation
	deploymentMode := pi.DeploymentMode
	s3BucketType := pi.S3BucketType
	domainCertsType := pi.DomainCertsType
	messagingSystem := pi.MessagingSystem

	if domainCertsType[0:19] == "Let's encrypt certs" {
		Volumes["letsencrypt"] = pt.Volume{
			Name:       "letsencrypt",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
	}

	if messagingSystem == "mqtt" {
		Volumes["mosquitto_data"] = pt.Volume{
			Name:       "mosquitto_data",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
		Volumes["mosquitto_log"] = pt.Volume{
			Name:       "mosquitto_log",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
	} else if messagingSystem == "nats" {
		for iNatsNode := 1; iNatsNode <= pi.NumNatsClusterNodes; iNatsNode++ {
			volumeName := fmt.Sprintf("nats%d_data", iNatsNode)
			Volumes[volumeName] = pt.Volume{
				Name:       volumeName,
				Driver:     "local",
				DriverOpts: map[string]string{},
			}
		}
	}

	Volumes["pgdata"] = pt.Volume{
		Name:       "pgdata",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["grafana_data"] = pt.Volume{
		Name:       "grafana_data",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["timescaledb_data"] = pt.Volume{
		Name:       "timescaledb_data",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["timescaledb_wal"] = pt.Volume{
		Name:       "timescaledb_wal",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["s3_storage_data"] = pt.Volume{
		Name:       "s3_storage_data",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["admin_api_log"] = pt.Volume{
		Name:       "admin_api_log",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}

	if deploymentMode == "development" {
		Volumes["portainer_data"] = pt.Volume{
			Name:       "portainer_data",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
		Volumes["pgadmin4_data"] = pt.Volume{
			Name:       "pgadmin4_data",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
	}

	if s3BucketType == "Local Minio" {
		Volumes["minio_storage"] = pt.Volume{
			Name:       "minio_storage",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
	}

	for iorg := 0; iorg < len(platformData.Organizations); iorg++ {
		orgAcronym := strings.ToLower(platformData.Organizations[iorg].OrgAcronym)
		numNodeRedInstances := len(platformData.Organizations[iorg].NodeRedInstances)
		for inri := 0; inri < numNodeRedInstances; inri++ {
			nriHash := platformData.Organizations[iorg].NodeRedInstances[inri].NriHash
			serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
			volumeName := fmt.Sprintf("%s_data", serviceName)
			Volumes[volumeName] = pt.Volume{
				Name:       volumeName,
				Driver:     "local",
				DriverOpts: map[string]string{},
			}
		}
	}

	nodesData := pi.NodesData
	if deploymentLocation == "On-premise cluster deployment" && len(nodesData) > 1 {
		nfsServerIP := ""
		for _, node := range nodesData {
			if node.NodeRole == "NFS Server" {
				nfsServerIP = node.NodeIP
				break
			}
		}
		//Atention verify case nfsServerIP := ""

		driverOptsO := fmt.Sprintf("nfsvers=4,addr=%s,rw", nfsServerIP)

		if domainCertsType[0:19] == "Let's encrypt certs" {
			letsencryptData := Volumes["letsencrypt"]
			letsencryptData.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": ":/var/nfs_osi4iot/letsencrypt",
			}
			Volumes["letsencrypt"] = letsencryptData
		}

		mosquittoData := Volumes["mosquitto_data"]
		mosquittoData.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": ":/var/nfs_osi4iot/mosquitto_data",
		}
		Volumes["mosquitto_data"] = mosquittoData

		mosquittoLog := Volumes["mosquitto_log"]
		mosquittoLog.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": ":/var/nfs_osi4iot/mosquitto_log",
		}
		Volumes["mosquitto_log"] = mosquittoLog

		pgdata := Volumes["pgdata"]
		pgdata.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": ":/var/nfs_osi4iot/pgdata",
		}
		Volumes["pgdata"] = pgdata

		timescaledbData := Volumes["timescaledb_data"]
		timescaledbData.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": ":/var/nfs_osi4iot/timescaledb_data",
		}
		Volumes["timescaledb_data"] = timescaledbData

		grafanaData := Volumes["grafana_data"]
		grafanaData.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": ":/var/nfs_osi4iot/grafana_data",
		}
		Volumes["grafana_data"] = grafanaData

		adminAPILog := Volumes["admin_api_log"]
		adminAPILog.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": ":/var/nfs_osi4iot/admin_api_log",
		}
		Volumes["admin_api_log"] = adminAPILog

		s3StorageData := Volumes["s3_storage_data"]
		s3StorageData.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": ":/var/nfs_osi4iot/s3_storage_data",
		}
		Volumes["s3_storage_data"] = s3StorageData

		if deploymentMode == "development" {
			portainerData := Volumes["portainer_data"]
			portainerData.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": ":/var/nfs_osi4iot/portainer_data",
			}
			Volumes["portainer_data"] = portainerData

			pgadmin4Data := Volumes["pgadmin4_data"]
			pgadmin4Data.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": ":/var/nfs_osi4iot/pgadmin4_data",
			}
			Volumes["pgadmin4_data"] = pgadmin4Data
		}

		if s3BucketType == "Local Minio" {
			minioStorage := Volumes["minio_storage"]
			minioStorage.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": ":/var/nfs_osi4iot/minio_storage",
			}
			Volumes["minio_storage"] = minioStorage
		}

		for iorg := 0; iorg < len(platformData.Organizations); iorg++ {
			orgAcronym := strings.ToLower(platformData.Organizations[iorg].OrgAcronym)
			numNodeRedInstances := len(platformData.Organizations[iorg].NodeRedInstances)
			for inri := 0; inri < numNodeRedInstances; inri++ {
				nriHash := platformData.Organizations[iorg].NodeRedInstances[inri].NriHash
				serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
				volumeName := fmt.Sprintf("%s_data", serviceName)
				nriVolume := Volumes[volumeName]
				nriVolume.DriverOpts = map[string]string{
					"type":   "nfs",
					"o":      driverOptsO,
					"device": fmt.Sprintf(":/var/nfs_osi4iot/%s", volumeName),
				}
				Volumes[volumeName] = nriVolume
			}
		}
	} else if deploymentLocation == "AWS cluster deployment" && len(nodesData) > 1 {
		awsEfsDNS := pi.AwsEfsDNS
		driverOptsO := fmt.Sprintf("addr=%s,nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport", awsEfsDNS)

		if domainCertsType[0:19] == "Let's encrypt certs" {
			letsencryptData := Volumes["letsencrypt"]
			letsencryptData.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": fmt.Sprintf("%s:/letsencrypt", awsEfsDNS),
			}
			Volumes["letsencrypt"] = letsencryptData
		}

		mosquittoData := Volumes["mosquitto_data"]
		mosquittoData.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": fmt.Sprintf("%s:/mosquitto_data", awsEfsDNS),
		}
		Volumes["mosquitto_data"] = mosquittoData

		mosquittoLog := Volumes["mosquitto_log"]
		mosquittoLog.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": fmt.Sprintf("%s:/mosquitto_log", awsEfsDNS),
		}
		Volumes["mosquitto_log"] = mosquittoLog

		pgdata := Volumes["pgdata"]
		pgdata.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": fmt.Sprintf("%s:/pgdata", awsEfsDNS),
		}
		Volumes["pgdata"] = pgdata

		grafanaData := Volumes["grafana_data"]
		grafanaData.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": fmt.Sprintf("%s:/grafana_data", awsEfsDNS),
		}
		Volumes["grafana_data"] = grafanaData

		timescaledbData := Volumes["timescaledb_data"]
		timescaledbData.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": fmt.Sprintf("%s:/timescaledb_data", awsEfsDNS),
		}
		Volumes["timescaledb_data"] = timescaledbData

		adminAPILog := Volumes["admin_api_log"]
		adminAPILog.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": fmt.Sprintf("%s:/admin_api_log", awsEfsDNS),
		}
		Volumes["admin_api_log"] = adminAPILog

		s3StorageData := Volumes["s3_storage_data"]
		s3StorageData.DriverOpts = map[string]string{
			"type":   "nfs",
			"o":      driverOptsO,
			"device": fmt.Sprintf("%s:/s3_storage_data", awsEfsDNS),
		}
		Volumes["s3_storage_data"] = s3StorageData

		if deploymentMode == "development" {
			portainerData := Volumes["portainer_data"]
			portainerData.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": fmt.Sprintf("%s:/portainer_data", awsEfsDNS),
			}
			Volumes["portainer_data"] = portainerData

			pgadmin4Data := Volumes["pgadmin4_data"]
			pgadmin4Data.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": fmt.Sprintf("%s:/pgadmin4_data", awsEfsDNS),
			}
			Volumes["pgadmin4_data"] = pgadmin4Data
		}

		if s3BucketType == "Local Minio" {
			minioStorage := Volumes["minio_storage"]
			minioStorage.DriverOpts = map[string]string{
				"type":   "nfs",
				"o":      driverOptsO,
				"device": fmt.Sprintf("%s:/minio_storage", awsEfsDNS),
			}
			Volumes["minio_storage"] = minioStorage
		}

		for iorg := 0; iorg < len(platformData.Organizations); iorg++ {
			orgAcronym := strings.ToLower(platformData.Organizations[iorg].OrgAcronym)
			numNodeRedInstances := len(platformData.Organizations[iorg].NodeRedInstances)
			for inri := 0; inri < numNodeRedInstances; inri++ {
				nriHash := platformData.Organizations[iorg].NodeRedInstances[inri].NriHash
				serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
				volumeName := fmt.Sprintf("%s_data", serviceName)
				nriVolume := Volumes[volumeName]
				nriVolume.DriverOpts = map[string]string{
					"type":   "nfs",
					"o":      driverOptsO,
					"device": fmt.Sprintf("%s:/%s", awsEfsDNS, volumeName),
				}
				Volumes[volumeName] = nriVolume
			}
		}
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

func CreateSwarmVolumes(platformData *pt.PlatformData) (map[string]pt.Volume, error) {
	volumesMap := GenerateVolumes(platformData)
	numNodes := len(platformData.PlatformInfo.NodesData)
	errors := []error{}
	for _, dc := range pt.DCMap {
		var filteredVolumes map[string]pt.Volume
		if numNodes == 1 {
			filteredVolumes = volumesMap
		} else {
			filteredVolumes = getVolumesMapByNodeRole(platformData, volumesMap, dc.Node.NodeRole)
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

func RemoveSwarmVolumes(platformData *pt.PlatformData) error {
	errors := []error{}
	filterByNames := getVolumeFilterByNames(platformData)

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

func getVolumeFilterByNames(platformData *pt.PlatformData) filters.Args {
	volumeNames := []string{
		"letsencrypt",
		"mosquitto_data",
		"mosquitto_log",
		"pgdata",
		"grafana_data",
		"timescaledb_data",
		"s3_storage_data",
		"admin_api_log",
		"portainer_data",
		"pgadmin4_data",
		"minio_storage",
	}

	for iorg := 0; iorg < len(platformData.Organizations); iorg++ {
		orgAcronym := strings.ToLower(platformData.Organizations[iorg].OrgAcronym)
		numNodeRedInstances := len(platformData.Organizations[iorg].NodeRedInstances)
		for inri := 0; inri < numNodeRedInstances; inri++ {
			nriHash := platformData.Organizations[iorg].NodeRedInstances[inri].NriHash
			serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
			nriVolumeName := fmt.Sprintf("%s_data", serviceName)
			volumeNames = append(volumeNames, nriVolumeName)
		}
	}

	volumeFilters := filters.NewArgs()
	for _, name := range volumeNames {
		volumeFilters.Add("name", name)
	}

	return volumeFilters
}

func getVolumesMapByNodeRole(platformData *pt.PlatformData, volumesMap map[string]pt.Volume, nodeRole string) map[string]pt.Volume {
	volumeNames := []string{}
	switch nodeRole {
	case "Manager":
		volumeNames = append(volumeNames,
			"letsencrypt",
			"grafana_data",
		)
	case "Platform worker":
		volumeNames = append(volumeNames,
			"mosquitto_data",
			"mosquitto_log",
			"pgdata",
			"timescaledb_data",
			"s3_storage_data",
			"admin_api_log",
			"portainer_data",
			"pgadmin4_data",
			"minio_storage",
		)
	case "Generic org worker":
		for iorg := 0; iorg < len(platformData.Organizations); iorg++ {
			orgAcronym := strings.ToLower(platformData.Organizations[iorg].OrgAcronym)
			numNodeRedInstances := len(platformData.Organizations[iorg].NodeRedInstances)
			for inri := 0; inri < numNodeRedInstances; inri++ {
				nriHash := platformData.Organizations[iorg].NodeRedInstances[inri].NriHash
				serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
				nriVolumeName := fmt.Sprintf("%s_data", serviceName)
				volumeNames = append(volumeNames, nriVolumeName)
			}
		}
	case "ExclusiveOrgWorker":
		//no code
	case "NfsWorker":
		//no code
	}

	filteredVolumes := make(map[string]pt.Volume)
	for _, name := range volumeNames {
		filteredVolumes[name] = volumesMap[name]
	}

	return filteredVolumes
}
