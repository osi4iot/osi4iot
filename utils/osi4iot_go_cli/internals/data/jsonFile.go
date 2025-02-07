package data

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

var osi4iotStateFile = "osi4iot_state.json"

func ExistFile(filePath string) bool {
	existFile := false
	_, err := os.Stat(filePath)
	if err == nil {
		existFile = true
	} else {
		if os.IsNotExist(err) {
			existFile = false
		}
	}
	return existFile
}

func ExistStateFile() bool {
	return ExistFile(osi4iotStateFile)
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
		PlatformState = Stopped
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
	}
	
	return nil
}

func CreateGeoJsonFiles() error {
	mainOrgBuildingPath := Data.PlatformInfo.MainOrganizationBuildingPath
	mainOrgBuildingData := Data.PlatformInfo.MainOrganizationBuilding
	if mainOrgBuildingPath != "" && mainOrgBuildingData != "" && !ExistFile(mainOrgBuildingPath) {
		err := utils.WriteToFile(mainOrgBuildingPath, []byte(mainOrgBuildingData), 0644)
		if err != nil {
			return err
		}
	}

	mainOrgFirstFloorPath := Data.PlatformInfo.MainOrganizationFirstFloorPath
	mainOrgFirstFloorData := Data.PlatformInfo.MainOrganizationFirstFloor
	if mainOrgFirstFloorPath != "" && mainOrgFirstFloorData != "" && !ExistFile(mainOrgFirstFloorPath) {
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
		if privateKeyPath != "" && privateKey != "" && !ExistFile(privateKeyPath) {
			err := utils.WriteToFile(privateKeyPath, []byte(privateKey), 0644)
			if err != nil {
				return err
			}
		}

		caPemPath := Data.PlatformInfo.DOMAIN_SSL_CA_PEM_PATH
		caPem := Data.Certs.DomainCerts.SslCaPem
		if caPemPath != "" && caPem != "" && !ExistFile(caPemPath) {
			err := utils.WriteToFile(caPemPath, []byte(caPem), 0644)
			if err != nil {
				return err
			}
		}

		certPath := Data.PlatformInfo.DOMAIN_SSL_CERT_CRT_PATH
		cert := Data.Certs.DomainCerts.SslCertCrt
		if certPath != "" && cert != "" && !ExistFile(certPath) {
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
	if awsKeyPath != "" && awsKey != "" && !ExistFile(awsKeyPath) {
		err := utils.WriteToFile(awsKeyPath, []byte(awsKey), 0644)
		if err != nil {
			return err
		}
	}

	sshPrivKeyPath := Data.PlatformInfo.SshPrivKeyPath
	sshPrivKey := Data.PlatformInfo.SshPrivKey
	if sshPrivKeyPath != "" && sshPrivKey != "" && !ExistFile(sshPrivKeyPath) {
		err := utils.WriteToFile(sshPrivKeyPath, []byte(sshPrivKey), 0644)
		if err != nil {
			return err
		}
	}

	sshPubKeyPath := Data.PlatformInfo.SshPubKeyPath
	sshPubKey := Data.PlatformInfo.SshPubKey
	if sshPubKeyPath != "" && sshPubKey != "" && !ExistFile(sshPubKeyPath) {
		err := utils.WriteToFile(sshPubKeyPath, []byte(sshPubKey), 0644)
		if err != nil {
			return err
		}
	}

	return nil
}
