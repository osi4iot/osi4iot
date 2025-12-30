package data

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/errdefs"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/docker"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

var osi4iotStateFile = "osi4iot_state.json"

func ExistStateFile() bool {
	return utils.ExistFile(osi4iotStateFile)
}

func SetInitialPlatformState() error {
	existStateFile := ExistStateFile()
	if !existStateFile {
		PlatformState = Empty
		return nil
	}

	platformData := GetData()
	isSwarmInitialized, err := docker.CheckSwarmInitiation(platformData)
	if err != nil {
		return fmt.Errorf("error checking swarm initiation: %v", err)
	}
	if !isSwarmInitialized {
		PlatformState = Deleted
		return nil
	}

	dc, err := docker.GetManagerDC()
	if err != nil {
		PlatformState = Unknown
		return fmt.Errorf("error getting docker client: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		PlatformState = Unknown
		return fmt.Errorf("error listing services: %v", err)
	}

	if len(services) > 0 {
		PlatformState = Initiating
		allHealthy := true
		for _, service := range services {
			if service.Spec.Name == "system-prune" {
				continue
			}
			serviceFilter := filters.NewArgs()
			serviceFilter.Add("service", service.ID)
			tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{
				Filters: serviceFilter,
			})
			if err != nil {
				return fmt.Errorf("error listing tasks: %v", err)
			}
			numTasksRequired := int(*service.Spec.Mode.Replicated.Replicas)
			numTasksRunning := 0
			for _, task := range tasks {
				if task.Status.State == swarm.TaskStateRunning {
					containerID := task.Status.ContainerStatus.ContainerID
					if containerID == "" {
						return fmt.Errorf("error container %s does not have a container ID", task.ID[:10])
					}

					container, err := dc.Cli.ContainerInspect(dc.Ctx, containerID)
					if err != nil {
						if errdefs.IsNotFound(err) {
							continue
						}
						return fmt.Errorf("error inspecting container %s: %v", containerID[:10], err)
					}

					if container.State.Health == nil {
						return fmt.Errorf("error container %s does not have a health check configured", containerID[:10])
					}
					healthStatus := container.State.Health.Status
					if healthStatus == "healthy" {
						numTasksRunning++
					}
				}
			}
			if numTasksRunning < numTasksRequired {
				allHealthy = false
			}
		}
		if allHealthy {
			PlatformState = Running
		}
	} else {
		numVolumes := 0
		for _, dc := range pt.DCMap {
			existingVolumes, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{
				Filters: filterArgs,
			})
			if err != nil {
				PlatformState = Unknown
				return fmt.Errorf("error listing volumes: %v", err)
			}
			numVolumes += len(existingVolumes.Volumes)
		}

		if numVolumes > 0 {
			PlatformState = Stopped
		} else {
			PlatformState = Deleted
		}

	}
	return nil
}

func ReadPlatformDataFromFile() error {
	existFile := ExistStateFile()
	if existFile {
		jsonFile, err := os.Open(osi4iotStateFile)
		if err != nil {
			return err
		}
		defer jsonFile.Close()

		byteValue, _ := io.ReadAll(jsonFile)
		err = json.Unmarshal(byteValue, &Data)
		if err != nil {
			return err
		}

		err = fixingPlatformData()
		if err != nil {
			return fmt.Errorf("error fixing platform data: %v", err)
		}
	}

	return nil
}

func getDefaultServicesDataMap(pd *pt.PlatformData) map[string]pt.ServiceData {
	pi := pd.PlatformInfo
	messagingSvcCpus := strings.Split(pi.MessagingSvcResources, "-")[0]
	messagingSvcCpusFloat, _ := strconv.ParseFloat(messagingSvcCpus[0:len(messagingSvcCpus)-3], 64)
	messagingSvcCpus_025 := fmt.Sprintf("%.2fCPU", 0.25*messagingSvcCpusFloat)
	messagingSvcCpus_050 := fmt.Sprintf("%.2fCPU", 0.50*messagingSvcCpusFloat)
	iotStorageDataSvcCpus := strings.Split(pi.IotDataStorageSvcResources, "-")[0]
	adminDataStorageSvcCpus := strings.Split(pi.AdminDataStorageSvcResources, "-")[0]
	adminDataStorageSvcCpusFloat, _ := strconv.ParseFloat(adminDataStorageSvcCpus[0:len(adminDataStorageSvcCpus)-3], 64)
	adminDataStorageSvcCpus_050 := fmt.Sprintf("%.2fCPU", 0.50*adminDataStorageSvcCpusFloat)
	uiSvcCpus := strings.Split(pi.UiSvcResources, "-")[0]
	uiSvcCpusFloat, _ := strconv.ParseFloat(uiSvcCpus[0:len(uiSvcCpus)-3], 64)
	uiSvcCpus_050 := fmt.Sprintf("%.2fCPU", 0.50*uiSvcCpusFloat)
	pipelinesSvcCpus := strings.Split(pi.PipelinesSvcResources, "-")[0]

	messagingSvcMem := strings.Split(pi.MessagingSvcResources, "-")[1]
	messagingSvcMemFloat, _ := strconv.ParseFloat(messagingSvcMem[0:len(messagingSvcMem)-2], 64)
	messagingSvcMem_025 := fmt.Sprintf("%.2fMb", 0.25*messagingSvcMemFloat)
	iotDataStorageSvcMem := strings.Split(pi.IotDataStorageSvcResources, "-")[1]
	iotDataStorageSvcMemFloat, _ := strconv.ParseFloat(iotDataStorageSvcMem[0:len(iotDataStorageSvcMem)-2], 64)
	iotDataStorageSvcMem_050 := fmt.Sprintf("%.2fMb", 0.50*iotDataStorageSvcMemFloat)

	adminDataStorageSvcMem := strings.Split(pi.AdminDataStorageSvcResources, "-")[1]
	adminDataStorageSvcMemFloat, _ := strconv.ParseFloat(adminDataStorageSvcMem[0:len(adminDataStorageSvcMem)-2], 64)
	adminDataStorageSvcMem_050 := fmt.Sprintf("%.2fMb", 0.50*adminDataStorageSvcMemFloat)
	uiSvcMem := strings.Split(pi.UiSvcResources, "-")[1]
	uiSvcMemFloat, _ := strconv.ParseFloat(uiSvcMem[0:len(uiSvcMem)-2], 64)
	uiSvcMem_050 := fmt.Sprintf("%.2fMb", 0.50*uiSvcMemFloat)
	pipelinesSvcMem := strings.Split(pi.PipelinesSvcResources, "-")[1]
	defaultNumNatsReplicas := utils.Max(pi.DefaultNumOfNatsReplicas, 1)

	defaultServicesDataMap := map[string]pt.ServiceData{
		"admin_api": {
			ServiceName: "admin_api",
			Image: "ghcr.io/osi4iot/admin_api_nats:1.3.0",
			Replicas:    1,
			Cpu:         uiSvcCpus,
			Memory:      uiSvcMem,
		},
		"frontend": {
			ServiceName: "frontend",
			Image: "ghcr.io/osi4iot/frontend_nats:1.3.0",
			Replicas:    1,
			Cpu:         uiSvcCpus,
			Memory:      uiSvcMem,
		},
		"nats": {
			ServiceName: "nats",
			Image: "ghcr.io/osi4iot/nats:2.11.1-alpine",
			Replicas:    defaultNumNatsReplicas,
			Cpu:         messagingSvcCpus,
			Memory:      messagingSvcMem,
		},
		"auth_callout": {
			ServiceName: "auth_callout",
			Image: "ghcr.io/osi4iot/auth_callout:1.3.0",
			Replicas:    1,
			Cpu:         messagingSvcCpus_025,
			Memory:      messagingSvcMem_025,
		},
		"grafana": {
			ServiceName: "grafana",
			Image: "ghcr.io/osi4iot/grafana:8.4.1-ubuntu",
			Replicas:    1,
			Cpu:         uiSvcCpus,
			Memory:      uiSvcMem,
		},
		"pipelines": {
			ServiceName: "pipelines",
			Image: "ghcr.io/osi4iot/pipelines:1.3.0",
			Replicas:    pi.DefaultNumPipelinesInstances,
			Cpu:         pipelinesSvcCpus,
			Memory:      pipelinesSvcMem,
		},
		"traefik": {
			ServiceName: "traefik",
			Image: "ghcr.io/osi4iot/traefik_go_cli:v3.6",
			Replicas:    1,
			Cpu:         uiSvcCpus,
			Memory:      uiSvcMem,
		},
		"system-prune": {
			ServiceName: "system-prune",
			Image: "ghcr.io/osi4iot/system_prune:latest",
			Replicas:    1,
			Cpu:         "0.125CPU",
			Memory:      "100Mb",
		},
		"postgres": {
			ServiceName: "postgres",
			Image: "ghcr.io/osi4iot/postgres:14.6-alpine",
			Replicas:    1,
			Cpu:         adminDataStorageSvcCpus,
			Memory:      adminDataStorageSvcMem,
		},
		"timescaledb": {
			ServiceName: "timescaledb",
			Image: "ghcr.io/osi4iot/timescaledb:2.20.0-pg17",
			Replicas:    1,
			Cpu:         iotStorageDataSvcCpus,
			Memory:      iotDataStorageSvcMem,
		},
		"s3_storage": {
			ServiceName: "s3_storage",
			Image: "ghcr.io/osi4iot/s3_storage:1.3.0",
			Replicas:    1,
			Cpu:         adminDataStorageSvcCpus_050,
			Memory:      adminDataStorageSvcMem_050,
		},
		"dev2pdb": {
			ServiceName: "dev2pdb",
			Image: "ghcr.io/osi4iot/dev2pdb_nats:1.3.0",
			Replicas:    1,
			Cpu:         messagingSvcCpus_050,
			Memory:      iotDataStorageSvcMem_050,
		},
		"pgadmin4": {
			ServiceName: "pgadmin4",
			Image: "ghcr.io/osi4iot/pgadmin4:2023-10-18-2",
			Replicas:    1,
			Cpu:         uiSvcCpus_050,
			Memory:      uiSvcMem_050,
		},
		"grafana_renderer": {
			ServiceName: "grafana_renderer",
			Image: "ghcr.io/osi4iot/grafana_renderer:3.12.0",
			Replicas:    1,
			Cpu:         uiSvcCpus_050,
			Memory:      uiSvcMem_050,
		},
		"minio": {
			ServiceName: "minio",
			Image: "ghcr.io/osi4iot/minio:RELEASE.2023-10-16T04-13-43Z",
			Replicas:    1,
			Cpu:         adminDataStorageSvcCpus,
			Memory:      iotDataStorageSvcMem,
		},
		"keepalived": {
			ServiceName: "keepalived",
			Image: "ghcr.io/osi4iot/keepalived:latest",
			Replicas:    1,
			Cpu:         "0.25CPU",
			Memory:      "250Mb",
		},
	}
	return defaultServicesDataMap

}

func fixingPlatformData() error {
	pd := GetData()

	nodesData := pd.PlatformInfo.NodesData
	for nodeIdx, node := range nodesData {
		if node.NodeIP == "localhost" {
			nodeIP, err := utils.GetLocalNodeIP()
			if err != nil {
				return fmt.Errorf("error getting local node IP: %v", err)
			}
			nodesData[nodeIdx].NodeIP = nodeIP
		}
	}

	servicesList := []string{
		"admin_api",
		"frontend",
		"nats",
		"auth_callout",
		"grafana",
		"pipelines",
		"traefik",
		"system-prune",
		"postgres",
		"timescaledb",
		"s3_storage",
		"dev2pdb",
		"pgadmin4",
		"grafana_renderer",
		"minio",
		"keepalived",
	}

	defaultServicesDataMap := getDefaultServicesDataMap(pd)

	servicesData := pd.PlatformInfo.ServicesData
	if len(servicesData) == 0 {
		var defaultServicesData []pt.ServiceData
		for _, svcName := range servicesList {
			defaultServicesData = append(defaultServicesData, defaultServicesDataMap[svcName])
		}
		servicesData = defaultServicesData
	} else {
		for serviceName, defaultSvcData := range defaultServicesDataMap {
			found := false
			for _, svcData := range servicesData {
				if svcData.ServiceName == serviceName {
					found = true
					break
				}
			}
			if !found {
				servicesData = append(servicesData, defaultSvcData)
			}
		}

		for svcIdx, svc := range servicesData {
			serviceName := svc.ServiceName
			if svc.Image == "" {
				servicesData[svcIdx].Image = defaultServicesDataMap[serviceName].Image
			}
			if svc.Replicas < 1 {
				servicesData[svcIdx].Replicas = defaultServicesDataMap[serviceName].Replicas
			}
			if svc.Cpu == "" {
				servicesData[svcIdx].Cpu = defaultServicesDataMap[serviceName].Cpu
			}
			if svc.Memory == "" {
				servicesData[svcIdx].Memory = defaultServicesDataMap[serviceName].Memory
			}
		}
	}

	return nil
}

func SetInitialServicesData(pd *pt.PlatformData) {
	pd.PlatformInfo.ServicesData = []pt.ServiceData{}
	defaultServicesDataMap := getDefaultServicesDataMap(pd)
	for _, svcData := range defaultServicesDataMap {
		pd.PlatformInfo.ServicesData = append(pd.PlatformInfo.ServicesData, svcData)
	}
}

func CreateGeoJsonFiles() error {
	mainOrgBuildingPath := Data.PlatformInfo.MainOrganizationBuildingPath
	mainOrgBuildingData := Data.PlatformInfo.MainOrganizationBuilding
	if mainOrgBuildingPath != "" && mainOrgBuildingData != "" && !utils.ExistFile(mainOrgBuildingPath) {
		err := utils.WriteToFile(mainOrgBuildingPath, []byte(mainOrgBuildingData), 0644)
		if err != nil {
			return err
		}
	}

	mainOrgFirstFloorPath := Data.PlatformInfo.MainOrganizationFirstFloorPath
	mainOrgFirstFloorData := Data.PlatformInfo.MainOrganizationFirstFloor
	if mainOrgFirstFloorPath != "" && mainOrgFirstFloorData != "" && !utils.ExistFile(mainOrgFirstFloorPath) {
		err := utils.WriteToFile(mainOrgFirstFloorPath, []byte(mainOrgFirstFloorData), 0644)
		if err != nil {
			return err
		}
	}
	return nil
}

func CreateDomainCertsFiles() error {
	if Data.PlatformInfo.DomainCertsType == "Certs provided by an CA" {
		privateKeyPath := Data.PlatformInfo.DOMAIN_SSL_PRIVATE_KEY_PATH
		privateKey := Data.Certs.DomainCerts.PrivateKey
		if privateKeyPath != "" && privateKey != "" && !utils.ExistFile(privateKeyPath) {
			err := utils.WriteToFile(privateKeyPath, []byte(privateKey), 0644)
			if err != nil {
				return err
			}
		}

		caPemPath := Data.PlatformInfo.DOMAIN_SSL_CA_PEM_PATH
		caPem := Data.Certs.DomainCerts.SslCaPem
		if caPemPath != "" && caPem != "" && !utils.ExistFile(caPemPath) {
			err := utils.WriteToFile(caPemPath, []byte(caPem), 0644)
			if err != nil {
				return err
			}
		}

		certPath := Data.PlatformInfo.DOMAIN_SSL_CERT_CRT_PATH
		cert := Data.Certs.DomainCerts.SslCertCrt
		if certPath != "" && cert != "" && !utils.ExistFile(certPath) {
			err := utils.WriteToFile(certPath, []byte(cert), 0644)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func CreateSSHKeysFile() error {
	awsKeyPath := Data.PlatformInfo.AwsSshKeyPath
	awsKey := Data.PlatformInfo.AwsSshKey
	if awsKeyPath != "" && awsKey != "" && !utils.ExistFile(awsKeyPath) {
		err := utils.WriteToFile(awsKeyPath, []byte(awsKey), 0600)
		if err != nil {
			return err
		}
	}

	sshPrivKeyPath := Data.PlatformInfo.SshPrivKeyPath
	sshPrivKey := Data.PlatformInfo.SshPrivKey
	if sshPrivKeyPath != "" && sshPrivKey != "" && !utils.ExistFile(sshPrivKeyPath) {
		err := utils.WriteToFile(sshPrivKeyPath, []byte(sshPrivKey), 0600)
		if err != nil {
			return err
		}
	}

	sshPubKeyPath := Data.PlatformInfo.SshPubKeyPath
	sshPubKey := Data.PlatformInfo.SshPubKey
	if sshPubKeyPath != "" && sshPubKey != "" && !utils.ExistFile(sshPubKeyPath) {
		err := utils.WriteToFile(sshPubKeyPath, []byte(sshPubKey), 0600)
		if err != nil {
			return err
		}
	}

	return nil
}

func GetServiceDataByName(serviceName string) *pt.ServiceData {
	servicesData := Data.PlatformInfo.ServicesData
	for _, svcData := range servicesData {
		if svcData.ServiceName == serviceName {
			return &svcData
		}
	}
	return nil
}
