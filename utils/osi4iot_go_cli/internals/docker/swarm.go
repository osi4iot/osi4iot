package docker

import (
	"context"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/ui/tools"
	"golang.org/x/crypto/ssh"
)

type SwarmData struct {
	Secrets  map[string]Secret
	Configs  map[string]Config
	Volumes  map[string]Volume
	Networks map[string]Network
}

var swarmData SwarmData

type DockerClient struct {
	Cli *client.Client
	SSH *ssh.Client
	Ctx context.Context
}

var dockerClient *DockerClient
var once sync.Once

func InitSwarm(platformData *common.PlatformData) (*DockerClient, error) {
	var swarmErr error = nil
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	if deploymentLocation == "" {
		return nil, fmt.Errorf("deployment location is not set")
	}

	once.Do(func() {
		ctx := context.Background()
		var cli *client.Client
		var sshConn *ssh.Client
		var err error

		managerNode := getManagerNode(platformData)
		runningInLocalHost, err := utils.IsHostIP(managerNode.NodeIP)
		if err != nil {
			swarmErr = fmt.Errorf("error getting host IP: %v", err)
			return
		}
		if deploymentLocation == "Local deployment" || runningInLocalHost {
			cli, err = client.NewClientWithOpts(
				client.FromEnv,
				client.WithAPIVersionNegotiation(),
			)
			if err != nil {
				swarmErr = fmt.Errorf("error creating docker client: %v", err)
				return
			}
		} else if deploymentLocation == "On-premise cluster deployment" || deploymentLocation == "AWS cluster deployment" {
			done := make(chan bool)
			spinnerMsg := "Connecting to manager node by SSH"
			endMsg := "Connection with manager node made successfully"
			utils.Spinner(spinnerMsg, endMsg, done)
			sshConfig := tools.SshConfigWithKey(managerNode.NodeUserName, platformData.PlatformInfo.SshPrivKey)
			address := fmt.Sprintf("%s:%d", managerNode.NodeIP, 22)
			sshConn, err = ssh.Dial("tcp", address, sshConfig)
			if err != nil {
				swarmErr = fmt.Errorf("error dialing SSH: %v", err)
				sshConn.Close()
				done <- true
				return
			}

			dialFunc := func(ctx context.Context, network, addr string) (net.Conn, error) {
				return sshConn.Dial(network, addr)
			}

			cli, err = client.NewClientWithOpts(
				client.WithVersion("1.41"),
				client.WithHost("tcp://127.0.0.1:2375"),
				client.WithDialContext(dialFunc),
			)
			if err != nil {
				swarmErr = fmt.Errorf("error creating docker client: %v", err)
				sshConn.Close()
				done <- true
				return
			} else {
				done <- true
			}
		}

		info, err := cli.Info(ctx)
		if err != nil {
			swarmErr = fmt.Errorf("error getting docker info: %v", err)
		}

		if !info.Swarm.ControlAvailable {
			_, err := cli.SwarmInit(ctx, swarm.InitRequest{
				AdvertiseAddr: "127.0.0.1",    // tu IP local o la IP real de la interfaz
				ListenAddr:    "0.0.0.0:2377", // por defecto Docker usa este puerto (2377)
			})
			if err != nil {
				swarmErr = fmt.Errorf("error initializing swarm: %v", err)
			}
		}

		dockerClient = &DockerClient{
			Cli: cli,
			SSH: sshConn,
			Ctx: ctx,
		}
	})

	return dockerClient, swarmErr
}

func (dc *DockerClient) Close() error {
	var errDocker, errSSH error

	if dc.Cli != nil {
		errDocker = dc.Cli.Close()
	}

	if dc.SSH != nil {
		errSSH = dc.SSH.Close()
	}

	if errDocker != nil || errSSH != nil {
		return fmt.Errorf("errors closing resources: Docker error: %v, SSH error: %v", errDocker, errSSH)
	}

	return nil
}

func getManagerNode(platformData *common.PlatformData) common.NodeData {
	var managerNode common.NodeData
	for _, node := range platformData.PlatformInfo.NodesData {
		if node.NodeRole == "Manager" {
			managerNode = node
		}
	}
	return managerNode
}

func RunSwarm(platformData *common.PlatformData)  error {
	docker, err := InitSwarm(platformData)
	if err != nil {
		return fmt.Errorf("error initializing swarm: %v", err)
	}

	secrets, err := CreateSwarmSecrets(platformData, docker)
	if err != nil {
		return fmt.Errorf("error creating swarm secrets: %v", err)
	}

	configs, err := CreateSwarmConfigs(platformData, docker)
	if err != nil {
		return fmt.Errorf("error creating swarm configs: %v", err)
	}

	volumes, err := CreateSwarmVolumes(platformData, docker)
	if err != nil {
		return fmt.Errorf("error creating swarm volumes: %v", err)
	}

	networks, err := CreateSwarmNetworks(platformData, docker)
	if err != nil {
		return fmt.Errorf("error creating swarm networks: %v", err)
	}

	swarmData = SwarmData{
		Secrets:  secrets,
		Configs:  configs,
		Volumes:  volumes,
		Networks: networks,
	}

	err = CreateSwarmServices(platformData, docker, swarmData)
	if err != nil {
		return fmt.Errorf("error creating swarm services: %v", err)
	}

	return nil
}

func createSecret(docker *DockerClient, secretKey string, secret *Secret) error {
	existingSecrets, err := docker.Cli.SecretList(docker.Ctx, types.SecretListOptions{})
	if err != nil {
		fmt.Println("error listing secrets: ", err)
		return fmt.Errorf("error listing secrets: %v", err)
	}

	secretExists := false
	for _, s := range existingSecrets {
		if s.Spec.Name == secret.Name {
			secretExists = true
			secret.ID = s.ID
			break
		} else if s.Spec.Name != secret.Name && s.Spec.Name[:len(secretKey)] == secretKey {
			secretExists = false
			err = docker.Cli.SecretRemove(docker.Ctx, s.ID)
			if err != nil {
				return fmt.Errorf("error removing secret: %v", err)
			}
			break
		}
	}

	if !secretExists {
		secResp, err := docker.Cli.SecretCreate(docker.Ctx, swarm.SecretSpec{
			Annotations: swarm.Annotations{
				Name: secret.Name,
				Labels: map[string]string{
					"app": "osi4iot",
				},
			},
			Data: []byte(secret.Data),
		})
		if err != nil {
			return fmt.Errorf("error creating secret: %v", err)
		}
		secret.ID = secResp.ID
	}

	return nil
}

func CreateSwarmSecrets(platformData *common.PlatformData, docker *DockerClient) (map[string]Secret, error) {
	secrets := GenerateSecrets(platformData)
	for key, secret := range secrets {
		err := createSecret(docker, key, &secret)
		if err != nil {
			return nil, fmt.Errorf("error creating secret %s: %v", key, err)
		}
		secrets[key] = secret
	}

	return secrets, nil
}

func RemoveSwarmSecrets(docker *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingSecrets, err := docker.Cli.SecretList(docker.Ctx, types.SecretListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing secrets: %v", err)
	}

	for _, s := range existingSecrets {
		err = docker.Cli.SecretRemove(docker.Ctx, s.ID)
		if err != nil {
			return fmt.Errorf("error removing secret: %v", err)
		}
	}

	return nil
}

func CreateConfig(docker *DockerClient, configKey string, config *Config) error {
	existingConfigs, err := docker.Cli.ConfigList(docker.Ctx, types.ConfigListOptions{})
	if err != nil {
		return fmt.Errorf("error listing configs: %v", err)
	}

	configExists := false
	for _, c := range existingConfigs {
		if c.Spec.Name == config.Name {
			configExists = true
			config.ID = c.ID
			break
		} else if c.Spec.Name != config.Name && c.Spec.Name[:len(configKey)] == configKey {
			configExists = false
			err = docker.Cli.ConfigRemove(docker.Ctx, c.ID)
			if err != nil {
				return fmt.Errorf("error removing config: %v", err)
			}
			break
		}
	}

	if !configExists {
		configResp, err := docker.Cli.ConfigCreate(docker.Ctx, swarm.ConfigSpec{
			Annotations: swarm.Annotations{
				Name: config.Name,
				Labels: map[string]string{
					"app": "osi4iot",
				},
			},
			Data: []byte(config.Data),
		})
		if err != nil {
			return fmt.Errorf("error creating config: %v", err)
		}
		config.ID = configResp.ID
	}

	return nil
}

func CreateSwarmConfigs(platformData *common.PlatformData, docker *DockerClient) (map[string]Config, error) {
	configs := GenerateConfigs(platformData)
	for key, config := range configs {
		err := CreateConfig(docker, key, &config)
		if err != nil {
			return nil, fmt.Errorf("error creating config %s: %v", key, err)
		}
		configs[key] = config
	}

	return configs, nil
}

func RemoveSwarmConfigs(docker *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingConfigs, err := docker.Cli.ConfigList(docker.Ctx, types.ConfigListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing configs: %v", err)
	}

	for _, c := range existingConfigs {
		err = docker.Cli.ConfigRemove(docker.Ctx, c.ID)
		if err != nil {
			return fmt.Errorf("error removing config: %v", err)
		}
	}

	return nil
}

func CreateVolume(docker *DockerClient, swarmVol *Volume) error {
	existingVolumes, err := docker.Cli.VolumeList(docker.Ctx, volume.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing volumes: %v", err)
	}

	volumeExists := false
	for _, v := range existingVolumes.Volumes {
		if v.Name == swarmVol.Name {
			volumeExists = true
			break
		}
	}

	if !volumeExists {
		vol, err := docker.Cli.VolumeCreate(docker.Ctx, volume.CreateOptions{
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

func CreateSwarmVolumes(platformData *common.PlatformData, docker *DockerClient) (map[string]Volume, error) {
	volumes := GenerateVolumes(platformData)
	for key, volume := range volumes {
		err := CreateVolume(docker, &volume)
		if err != nil {
			return nil, fmt.Errorf("error creating volume %s: %v", volume.Name, err)
		}
		volumes[key] = volume
	}

	return volumes, nil
}

func RemoveSwarmVolumes(docker *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingVolumes, err := docker.Cli.VolumeList(docker.Ctx, volume.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing volumes: %v", err)
	}

	for _, v := range existingVolumes.Volumes {
		err = docker.Cli.VolumeRemove(docker.Ctx, v.Name, true)
		if err != nil {
			return fmt.Errorf("error removing volume: %v", err)
		}
	}

	return nil
}

func CreateNetwork(docker *DockerClient, swarmNetwork *Network) error {
	existingNetworks, err := docker.Cli.NetworkList(docker.Ctx, network.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing networks: %v", err)
	}

	networkExists := false
	for _, n := range existingNetworks {
		if n.Name == swarmNetwork.Name {
			networkExists = true
			break
		}
	}

	if !networkExists {
		net, err := docker.Cli.NetworkCreate(docker.Ctx, swarmNetwork.Name, network.CreateOptions{
			Driver:     swarmNetwork.Driver,
			Attachable: true,
			Labels: map[string]string{
				"app": "osi4iot",
			},
		})
		if err != nil {
			return fmt.Errorf("error creating network: %v", err)
		}
		swarmNetwork.Id = net.ID
	}

	return nil
}

func CreateSwarmNetworks(platformData *common.PlatformData, docker *DockerClient) (map[string]Network, error) {
	networks := GenerateNetworks(platformData)
	for _, network := range networks {
		err := CreateNetwork(docker, &network)
		if err != nil {
			return nil, fmt.Errorf("error creating network %s: %v", network.Name, err)
		}
	}

	return networks, nil
}

func RemoveSwarmNetworks(docker *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingNetworks, err := docker.Cli.NetworkList(docker.Ctx, network.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing networks: %v", err)
	}

	for _, n := range existingNetworks {
		err = docker.Cli.NetworkRemove(docker.Ctx, n.ID)
		if err != nil {
			return fmt.Errorf("error removing network: %v", err)
		}
	}

	return nil
}

func CreateService(docker *DockerClient, swarmService Service) error {
	existingServices, err := docker.Cli.ServiceList(docker.Ctx, types.ServiceListOptions{})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	serviceExists := false
	for _, s := range existingServices {
		if s.Spec.Name == swarmService.Name {
			serviceExists = true
			break
		}
	}

	if !serviceExists {
		_, err := docker.Cli.ServiceCreate(docker.Ctx, swarm.ServiceSpec{
			Annotations:  swarmService.Annotations,
			TaskTemplate: swarmService.TaskTemplate,
			EndpointSpec: swarmService.EndpointSpec,
			Mode:         swarmService.Mode,
			Networks:     swarmService.Networks,
		}, types.ServiceCreateOptions{})
		if err != nil {
			return fmt.Errorf("error creating service: %v", err)
		}
	}
	return nil
}

func CreateSwarmServices(platformData *common.PlatformData, docker *DockerClient, swarmData SwarmData) error {
	services := GenerateServices(platformData, swarmData)
	for _, service := range services {
		err := CreateService(docker, service)
		if err != nil {
			return fmt.Errorf("error creating service %s: %v", service.Name, err)
		}
	}
	return nil
}

func RemoveSwarmServices(docker *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingServices, err := docker.Cli.ServiceList(docker.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	for _, s := range existingServices {
		err = docker.Cli.ServiceRemove(docker.Ctx, s.ID)
		if err != nil {
			return fmt.Errorf("error removing service: %v", err)
		}
	}

	return nil
}

func StopPlatform(platformData *common.PlatformData) error {
	docker, err := InitSwarm(platformData)
	if err != nil {
		return fmt.Errorf("error initializing swarm: %v", err)
	}
	err = RemoveSwarmServices(docker)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	return nil
}

func DeletePlatform(platformData *common.PlatformData)  error {
	docker, err := InitSwarm(platformData)
	if err != nil {
		return fmt.Errorf("error initializing swarm: %v", err)
	}

	done := make(chan bool)
	spinnerMsg := "Waiting for all components to be deleted"
	endMsg := "All components have been deleted successfully"
	utils.Spinner(spinnerMsg, endMsg, done)
	err = RemoveSwarmServices(docker)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	err = RemoveSwarmSecrets(docker)
	if err != nil {
		return fmt.Errorf("error removing secrets: %v", err)
	}

	err = RemoveSwarmConfigs(docker)
	if err != nil {
		return fmt.Errorf("error removing configs: %v", err)
	}

	err = RemoveSwarmNetworks(docker)
	if err != nil {
		return fmt.Errorf("error removing networks: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	containers, err := docker.Cli.ContainerList(context.Background(), container.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing containers: %v", err)
	}

	for {
		if len(containers) == 0 {
			break
		}
		containers, err = docker.Cli.ContainerList(context.Background(), container.ListOptions{
			Filters: filterArgs,
		})
		if err != nil {
			return fmt.Errorf("error listing containers: %v", err)
		}
	}

	done <- true
	for i := 0; i < 60; i++ {
		time.Sleep(1 * time.Second) // wait for containers to stop completely
		err = RemoveSwarmVolumes(docker)
		if err == nil {
			break
		}
	}

	return nil
}

func WaitUntilAllContainersAreHealthy(platformData *common.PlatformData, serviceType string) error {
	docker, err := InitSwarm(platformData)
	if err != nil {
		return fmt.Errorf("error initializing swarm: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := docker.Cli.ServiceList(docker.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	filteredServices := []swarm.Service{}
	if serviceType != "all" {
		for _, service := range services {
			if val, ok := service.Spec.Labels["service_type"]; ok && val == serviceType {
				filteredServices = append(filteredServices, service)
			}
		}
	} else {
		filteredServices = services
	}

	done := make(chan bool)
	spinnerMsg := "Waiting for all containers to be healthy"
	endMsg := "All containers are healthy"
	if serviceType != "all" {
		spinnerMsg = fmt.Sprintf("Waiting for containers of service %s to be healthy", serviceType)
		endMsg = fmt.Sprintf("All containers of service %s are healthy", serviceType)
	}
	utils.Spinner(spinnerMsg, endMsg, done)
	for {
		allHealthy := true
		for _, service := range filteredServices {
			if service.Spec.Name == "system-prune" {
				continue
			}
			serviceFilter := filters.NewArgs()
			serviceFilter.Add("service", service.ID)
			tasks, err := docker.Cli.TaskList(docker.Ctx, types.TaskListOptions{
				Filters: serviceFilter,
			})
			if err != nil {
				return fmt.Errorf("error listing tasks: %v", err)
			}
			numTasksRunning := 0
			for _, task := range tasks {
				if task.Status.State != swarm.TaskStateRunning {
					continue
				} else {
					numTasksRunning++
				}

				containerID := task.Status.ContainerStatus.ContainerID
				if containerID == "" {
					return fmt.Errorf("error container %s does not have a container ID", task.ID[:10])
				}

				container, err := docker.Cli.ContainerInspect(docker.Ctx, containerID)
				if err != nil {
					return fmt.Errorf("error inspecting container %s: %v", containerID[:10], err)
				}

				if container.State.Health == nil {
					return fmt.Errorf("error container %s does not have a health check configured", containerID[:10])
				}
				healthStatus := container.State.Health.Status
				if healthStatus != "healthy" {
					allHealthy = false
				}
			}
			if numTasksRunning == 0 {
				allHealthy = false
			}
		}
		if allHealthy {
			break
		}
	}
	done <- true

	return nil
}

func findOrgAndNriIndex(platformData *common.PlatformData, orgAcronym string, nriHash string) (int, int) {
	orgIndex := -1
	nriIndex := -1
	for orgIdx, org := range platformData.Certs.MqttCerts.Organizations {
		if strings.ToLower(org.OrgAcronym) == orgAcronym {
			for nriIdx, nri := range org.NodeRedInstances {
				if nri.NriHash == nriHash {
					orgIndex = orgIdx
					nriIndex = nriIdx
					break
				} else {
					continue
				}
			}
		} else {
			continue
		}
	}
	return orgIndex, nriIndex
}

func SetNriVolumesAsCreated(platformData *common.PlatformData) (bool, error) {
	areNewNriVolumesCreated := false
	docker, err := InitSwarm(platformData)
	if err != nil {
		return false, fmt.Errorf("error initializing swarm: %v", err)
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

func SwarmInitiationInfo(platformData *common.PlatformData) error {
	err := WaitUntilAllContainersAreHealthy(platformData, "all")
	if err != nil {
		errMsg := utils.StyleErrMsg.Render("error waiting for the platform to be healthy: ", err.Error())
		fmt.Println(errMsg)
	} else {
		areNewNriVolumesCreated, err := SetNriVolumesAsCreated(platformData)
		if err != nil {
			errMsg := utils.StyleErrMsg.Render("error setting nri volumes as created: ", err.Error())
			fmt.Println(errMsg)
		} else {
			if areNewNriVolumesCreated {
				fmt.Println("")
				err := WaitUntilAllContainersAreHealthy(platformData, "nodered_instances")
				if err != nil {
					errMsg := utils.StyleErrMsg.Render("error waiting nri is to be healthy: ", err.Error())
					fmt.Println(errMsg)
				} else {
					err = utils.WritePlatformDataToFile(platformData)
					if err != nil {
						return fmt.Errorf("error writing platform data to file: %v", err)
					}
					okMsg := utils.StyleOKMsg.Render("Platform is ready to be used")
					fmt.Println(okMsg)
				}
			} else {
				err = utils.WritePlatformDataToFile(platformData)
				if err != nil {
					return fmt.Errorf("error writing platform data to file: %v", err)
				}
				okMsg := utils.StyleOKMsg.Render("Platform is ready to be used")
				fmt.Println(okMsg)

			}
		}
	}

	return nil
}
