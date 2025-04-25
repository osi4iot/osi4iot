package docker

import (
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/errdefs"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

type Volume struct {
	Name       string
	Driver     string
	ID         string
	DriverOpts map[string]string
}

func GenerateVolumes(platformData *common.PlatformData) map[string]Volume {
	Volumes := make(map[string]Volume)

	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	deploymentMode := platformData.PlatformInfo.DeploymentMode
	s3BucketType := platformData.PlatformInfo.S3BucketType
	domainCertsType := platformData.PlatformInfo.DomainCertsType

	if domainCertsType[0:19] == "Let's encrypt certs" {
		Volumes["letsencrypt"] = Volume{
			Name:       "letsencrypt",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
	}

	Volumes["mosquitto_data"] = Volume{
		Name:       "mosquitto_data",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["mosquitto_log"] = Volume{
		Name:       "mosquitto_log",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["pgdata"] = Volume{
		Name:       "pgdata",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["grafana_data"] = Volume{
		Name:       "grafana_data",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["timescaledb_data"] = Volume{
		Name:       "timescaledb_data",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["s3_storage_data"] = Volume{
		Name:       "s3_storage_data",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}
	Volumes["admin_api_log"] = Volume{
		Name:       "admin_api_log",
		Driver:     "local",
		DriverOpts: map[string]string{},
	}

	if deploymentMode == "development" {
		Volumes["portainer_data"] = Volume{
			Name:       "portainer_data",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
		Volumes["pgadmin4_data"] = Volume{
			Name:       "pgadmin4_data",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
	}

	if s3BucketType == "Local Minio" {
		Volumes["minio_storage"] = Volume{
			Name:       "minio_storage",
			Driver:     "local",
			DriverOpts: map[string]string{},
		}
	}

	for iorg := 0; iorg < len(platformData.Certs.MqttCerts.Organizations); iorg++ {
		orgAcronym := strings.ToLower(platformData.Certs.MqttCerts.Organizations[iorg].OrgAcronym)
		numNodeRedInstances := len(platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances)
		for inri := 0; inri < numNodeRedInstances; inri++ {
			nriHash := platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].NriHash
			serviceName := fmt.Sprintf("org_%s_nri_%s", orgAcronym, nriHash)
			volumeName := fmt.Sprintf("%s_data", serviceName)
			Volumes[volumeName] = Volume{
				Name:       volumeName,
				Driver:     "local",
				DriverOpts: map[string]string{},
			}
		}
	}

	nodesData := platformData.PlatformInfo.NodesData
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

		for iorg := 0; iorg < len(platformData.Certs.MqttCerts.Organizations); iorg++ {
			orgAcronym := strings.ToLower(platformData.Certs.MqttCerts.Organizations[iorg].OrgAcronym)
			numNodeRedInstances := len(platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances)
			for inri := 0; inri < numNodeRedInstances; inri++ {
				nriHash := platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].NriHash
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
		awsEfsDNS := platformData.PlatformInfo.AwsEfsDNS
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

		for iorg := 0; iorg < len(platformData.Certs.MqttCerts.Organizations); iorg++ {
			orgAcronym := strings.ToLower(platformData.Certs.MqttCerts.Organizations[iorg].OrgAcronym)
			numNodeRedInstances := len(platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances)
			for inri := 0; inri < numNodeRedInstances; inri++ {
				nriHash := platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].NriHash
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

func createVolume(dc *DockerClient, swarmVol *Volume) error {
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

func createSwarmVolumes(platformData *common.PlatformData) (map[string]Volume, error) {
	volumesMap := GenerateVolumes(platformData)
	numNodes := len(platformData.PlatformInfo.NodesData)
	errors := []error{}
	for _, dc := range DCMap {
		var filteredVolumes map[string]Volume
		if numNodes == 1 {
			filteredVolumes = volumesMap
		} else {
			filteredVolumes = getVolumesMapByNodeRole(platformData, volumesMap, dc.Node.NodeRole)
		}

		for key, volume := range filteredVolumes {
			err := createVolume(dc, &volume)
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

func removeSwarmVolumes(platformData *common.PlatformData) error {
	errors := []error{}
	filterByNames := getVolumeFilterByNames(platformData)

	for _, dc := range DCMap {
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

func getVolumeFilterByNames(platformData *common.PlatformData) filters.Args {
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

	for iorg := 0; iorg < len(platformData.Certs.MqttCerts.Organizations); iorg++ {
		orgAcronym := strings.ToLower(platformData.Certs.MqttCerts.Organizations[iorg].OrgAcronym)
		numNodeRedInstances := len(platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances)
		for inri := 0; inri < numNodeRedInstances; inri++ {
			nriHash := platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].NriHash
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

func getVolumesMapByNodeRole(platformData *common.PlatformData, volumesMap map[string]Volume, nodeRole string) map[string]Volume {
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
		for iorg := 0; iorg < len(platformData.Certs.MqttCerts.Organizations); iorg++ {
			orgAcronym := strings.ToLower(platformData.Certs.MqttCerts.Organizations[iorg].OrgAcronym)
			numNodeRedInstances := len(platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances)
			for inri := 0; inri < numNodeRedInstances; inri++ {
				nriHash := platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].NriHash
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

	filteredVolumes := make(map[string]Volume)
	for _, name := range volumeNames {
		filteredVolumes[name] = volumesMap[name]
	}

	return filteredVolumes
}

func setNriVolumesAsCreated(platformData *common.PlatformData) (bool, error) {
	areNewNriVolumesCreated := false
	docker, err := GetManagerDC()
	if err != nil {
		return false, fmt.Errorf("error getting docker client: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := docker.Cli.ServiceList(docker.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return false, fmt.Errorf("error listing services: %v", err)
	}
	filteredServices := []swarm.Service{}
	for _, service := range services {
		if val, ok := service.Spec.Labels["service_type"]; ok && val == "nodered_instance" {
			filteredServices = append(filteredServices, service)
		}
	}

	oldEnvVar := "IS_NODERED_INSTANCE_VOLUME_ALREADY_CREATED=false"
	newEnvVar := "IS_NODERED_INSTANCE_VOLUME_ALREADY_CREATED=true"
	for _, service := range filteredServices {
		serviceSpec := service.Spec
		envVars := serviceSpec.TaskTemplate.ContainerSpec.Env
		serviceNameArray := strings.Split(serviceSpec.Name, "_")
		orgAcronym := serviceNameArray[1]
		nriHash := serviceNameArray[3]
		orgIndex, nriIndex := findOrgAndNriIndex(platformData, orgAcronym, nriHash)
		serviceEnvModified := false
		for envIndex, envVar := range envVars {
			if envVar == oldEnvVar {
				envVars[envIndex] = newEnvVar
				serviceEnvModified = true
				break
			}
		}
		if orgIndex != -1 && nriIndex != -1 && serviceEnvModified {
			serviceSpec.TaskTemplate.ContainerSpec.Env = envVars
			response, err := docker.Cli.ServiceUpdate(docker.Ctx, service.ID, service.Version, serviceSpec, types.ServiceUpdateOptions{})
			if err != nil {
				return false, fmt.Errorf("error updating service: %v", err)
			} else {
				if len(response.Warnings) > 0 {
					fmt.Printf("Warnings at updating service %s: %v\n", service.Spec.Name, response.Warnings)
				}
				platformData.Certs.MqttCerts.Organizations[orgIndex].NodeRedInstances[nriIndex].IsVolumeCreated = "true"
				areNewNriVolumesCreated = true
			}
		}
	}

	return areNewNriVolumesCreated, nil
}

func RemoveNriVolumesInOrg(org common.Organization) error {
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
		for _, dc := range DCMap {
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
