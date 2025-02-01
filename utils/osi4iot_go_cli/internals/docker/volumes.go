package docker

import (
	"fmt"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
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
			Volumes[serviceName] = Volume{
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
	} else if deploymentLocation == "AWS cluster deployment" {
		awsEfsDNS := platformData.PlatformInfo.AwsEfsDNS
		driverOptsO := fmt.Sprintf("addr=%s,nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport", awsEfsDNS)

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
