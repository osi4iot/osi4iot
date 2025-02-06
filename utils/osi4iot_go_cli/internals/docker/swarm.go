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
	"github.com/docker/docker/api/types/image"
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
	Cli  *client.Client
	SSH  *ssh.Client
	Ctx  context.Context
	Node common.NodeData
}

var DCMap = make(map[string]*DockerClient)
var once sync.Once

func InitPlatform(platformData *common.PlatformData) error {
	deployLocation := platformData.PlatformInfo.DeploymentLocation
	nodesData := []common.NodeData{}
	numNodes := platformData.PlatformInfo.NumberOfSwarmNodes
	if deployLocation == "Local deployment" {
		localNodeData, err := getLocalNodeData()
		if err != nil {
			return fmt.Errorf("error getting local node data: %v", err)
		}
		nodesData = append(nodesData, localNodeData)
	} else {
		for idx := 0; idx < numNodes; idx++ {
			nodeData := platformData.PlatformInfo.NodesData[idx]
			nodesData = append(nodesData, nodeData)
		}
	}
	platformData.PlatformInfo.NodesData = nodesData

	err := initSwarm()
	if err != nil {
		return fmt.Errorf("error: initializing swarm %s", err.Error())
	}

	dc, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error: getting docker client %s", err.Error())
	}
    err = nodesConfiguration(platformData)
	if err != nil {
		return fmt.Errorf("error: configuring nodes %s", err.Error())
	}

	err = joinAllNodesToSwarm(dc)
	if err != nil {
		return fmt.Errorf("error: joining nodes to swarm %s", err.Error())
	}

	err = updateNodesData(dc, nodesData)
	if err != nil {
		return fmt.Errorf("error: updating nodes data %s", err.Error())
	}
	platformData.PlatformInfo.NodesData = nodesData

	err = RunSwarm(dc, platformData)
	if err != nil {
		return fmt.Errorf("error: running swarm %s", err.Error())
	}

	return nil
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

func RunSwarm(dc *DockerClient, platformData *common.PlatformData) error {
	secrets, err := createSwarmSecrets(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm secrets: %v", err)
	}

	configs, err := createSwarmConfigs(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm configs: %v", err)
	}

	volumes, err := createSwarmVolumes(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm volumes: %v", err)
	}

	networks, err := createSwarmNetworks(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm networks: %v", err)
	}

	swarmData = SwarmData{
		Secrets:  secrets,
		Configs:  configs,
		Volumes:  volumes,
		Networks: networks,
	}

	err = createSwarmServices(platformData, dc, swarmData)
	if err != nil {
		return fmt.Errorf("error creating swarm services: %v", err)
	}

	return nil
}

func createSecret(dc *DockerClient, secretKey string, secret *Secret) error {
	existingSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{})
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
			err = dc.Cli.SecretRemove(dc.Ctx, s.ID)
			if err != nil {
				return fmt.Errorf("error removing secret: %v", err)
			}
			break
		}
	}

	if !secretExists {
		secResp, err := dc.Cli.SecretCreate(dc.Ctx, swarm.SecretSpec{
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

func createSwarmSecrets(platformData *common.PlatformData, dc *DockerClient) (map[string]Secret, error) {
	secrets := GenerateSecrets(platformData)
	for key, secret := range secrets {
		err := createSecret(dc, key, &secret)
		if err != nil {
			return nil, fmt.Errorf("error creating secret %s: %v", key, err)
		}
		secrets[key] = secret
	}

	return secrets, nil
}

func removeSwarmSecrets(dc *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing secrets: %v", err)
	}

	for _, s := range existingSecrets {
		err = dc.Cli.SecretRemove(dc.Ctx, s.ID)
		if err != nil {
			return fmt.Errorf("error removing secret: %v", err)
		}
	}

	return nil
}

func createConfig(dc *DockerClient, configKey string, config *Config) error {
	existingConfigs, err := dc.Cli.ConfigList(dc.Ctx, types.ConfigListOptions{})
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
			err = dc.Cli.ConfigRemove(dc.Ctx, c.ID)
			if err != nil {
				return fmt.Errorf("error removing config: %v", err)
			}
			break
		}
	}

	if !configExists {
		configResp, err := dc.Cli.ConfigCreate(dc.Ctx, swarm.ConfigSpec{
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

func createSwarmConfigs(platformData *common.PlatformData, dc *DockerClient) (map[string]Config, error) {
	configs := GenerateConfigs(platformData)
	for key, config := range configs {
		err := createConfig(dc, key, &config)
		if err != nil {
			return nil, fmt.Errorf("error creating config %s: %v", key, err)
		}
		configs[key] = config
	}

	return configs, nil
}

func removeSwarmConfigs(dc *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingConfigs, err := dc.Cli.ConfigList(dc.Ctx, types.ConfigListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing configs: %v", err)
	}

	for _, c := range existingConfigs {
		err = dc.Cli.ConfigRemove(dc.Ctx, c.ID)
		if err != nil {
			return fmt.Errorf("error removing config: %v", err)
		}
	}

	return nil
}

func createVolume(dc *DockerClient, swarmVol *Volume) error {
	existingVolumes, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{})
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

func createSwarmVolumes(platformData *common.PlatformData, dc *DockerClient) (map[string]Volume, error) {
	volumes := GenerateVolumes(platformData)
	for key, volume := range volumes {
		err := createVolume(dc, &volume)
		if err != nil {
			return nil, fmt.Errorf("error creating volume %s: %v", volume.Name, err)
		}
		volumes[key] = volume
	}

	return volumes, nil
}

func removeSwarmVolumes() error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")

	errors := []error{}
	for _, dc := range DCMap {
		existingVolumes, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{
			Filters: filterArgs,
		})
		if err != nil {
			return fmt.Errorf("error listing volumes: %v", err)
		}

		for _, v := range existingVolumes.Volumes {
			err = dc.Cli.VolumeRemove(dc.Ctx, v.Name, true)
			if err != nil {
				errors = append(errors, fmt.Errorf("error removing volume: %v", err))
			}
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("errors removing volumes: %v", errors)
	}

	return nil
}

func createNetwork(dc *DockerClient, swarmNetwork *Network) error {
	existingNetworks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{})
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
		net, err := dc.Cli.NetworkCreate(dc.Ctx, swarmNetwork.Name, network.CreateOptions{
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

func createSwarmNetworks(platformData *common.PlatformData, dc *DockerClient) (map[string]Network, error) {
	networks := GenerateNetworks(platformData)
	for _, network := range networks {
		err := createNetwork(dc, &network)
		if err != nil {
			return nil, fmt.Errorf("error creating network %s: %v", network.Name, err)
		}
	}

	return networks, nil
}

func removeSwarmNetworks(dc *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingNetworks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing networks: %v", err)
	}

	for _, n := range existingNetworks {
		err = dc.Cli.NetworkRemove(dc.Ctx, n.ID)
		if err != nil {
			return fmt.Errorf("error removing network: %v", err)
		}
	}

	return nil
}

func createService(dc *DockerClient, swarmService Service) error {
	existingServices, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{})
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
		_, err := dc.Cli.ServiceCreate(dc.Ctx, swarm.ServiceSpec{
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

func createSwarmServices(platformData *common.PlatformData, dc *DockerClient, swarmData SwarmData) error {
	services := GenerateServices(platformData, swarmData)
	for _, service := range services {
		err := createService(dc, service)
		if err != nil {
			return fmt.Errorf("error creating service %s: %v", service.Name, err)
		}
	}
	return nil
}

func removeSwarmServices(dc *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingServices, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	for _, s := range existingServices {
		err = dc.Cli.ServiceRemove(dc.Ctx, s.ID)
		if err != nil {
			return fmt.Errorf("error removing service: %v", err)
		}
	}

	return nil
}

func StopPlatform(platformData *common.PlatformData) error {
	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}
	err = removeSwarmServices(docker)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	return nil
}

func DeletePlatform(platformData *common.PlatformData) error {
	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	done := make(chan bool)
	spinnerMsg := "Waiting for all components to be deleted"
	endMsg := "All components have been deleted successfully"
	utils.Spinner(spinnerMsg, endMsg, done)
	err = removeSwarmServices(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing services: %v", err)
	}

	err = removeSwarmSecrets(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing secrets: %v", err)
	}

	err = removeSwarmConfigs(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing configs: %v", err)
	}

	err = removeSwarmNetworks(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing networks: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	containers, err := docker.Cli.ContainerList(context.Background(), container.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		done <- false
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
			done <- false
			return fmt.Errorf("error listing containers: %v", err)
		}
	}

	done <- true
	for i := 0; i < 60; i++ {
		time.Sleep(1 * time.Second) // wait for containers to stop completely
		err = removeSwarmVolumes()
		if err == nil {
			break
		}
	}

	err = nodesLeaveSwarm()
	if err != nil {
		return fmt.Errorf("error leaving swarm: %v", err)
	}

	err = utils.WritePlatformDataToFile(platformData)
	if err != nil {
		return fmt.Errorf("error writing platform data to file: %v", err)
	}

	return nil
}

func waitUntilAllContainersAreHealthy(serviceType string) error {
	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error gettig docker client: %v", err)
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
				done <- false
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
					done <- false
					return fmt.Errorf("error container %s does not have a container ID", task.ID[:10])
				}

				container, err := docker.Cli.ContainerInspect(docker.Ctx, containerID)
				if err != nil {
					done <- false
					return fmt.Errorf("error inspecting container %s: %v", containerID[:10], err)
				}

				if container.State.Health == nil {
					done <- false
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

func SwarmInitiationInfo(platformData *common.PlatformData) error {
	err := waitUntilAllContainersAreHealthy("all")
	if err != nil {
		errMsg := utils.StyleErrMsg.Render("error waiting for the platform to be healthy: ", err.Error())
		fmt.Println(errMsg)
	} else {
		areNewNriVolumesCreated, err := setNriVolumesAsCreated(platformData)
		if err != nil {
			errMsg := utils.StyleErrMsg.Render("error setting nri volumes as created: ", err.Error())
			fmt.Println(errMsg)
		} else {
			if areNewNriVolumesCreated {
				err := waitUntilAllContainersAreHealthy("nodered_instances")
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

func getNodeDockerClient(node common.NodeData, deploymentLocation string, sshPrivKey string) (*DockerClient, error) {
	var cli *client.Client
	var sshConn *ssh.Client
	runningInLocalHost, err := utils.IsHostIP(node.NodeIP)
	if err != nil {
		return nil, fmt.Errorf("error getting host IP: %v", err)
	}

	if deploymentLocation == "Local deployment" || runningInLocalHost {
		cli, err = client.NewClientWithOpts(
			client.FromEnv,
			client.WithAPIVersionNegotiation(),
		)
		if err != nil {
			return nil, fmt.Errorf("error creating docker client in node %s: %v", node.NodeIP, err)
		}
	} else if deploymentLocation == "On-premise cluster deployment" || deploymentLocation == "AWS cluster deployment" {
		sshConfig := tools.SshConfigWithKey(node.NodeUserName, sshPrivKey)
		address := fmt.Sprintf("%s:%d", node.NodeIP, 22)
		sshConn, err = ssh.Dial("tcp", address, sshConfig)
		if err != nil {
			if sshConn != nil {
				sshConn.Close()
			}
			return nil, fmt.Errorf("error dialing SSH in node %s: %v", node.NodeIP, err)
		}
		dockerDaemon := "127.0.0.1:2375"
		dialFunc := func(ctx context.Context, network, addr string) (net.Conn, error) {
			return sshConn.Dial("tcp", dockerDaemon)
		}

		cli, err = client.NewClientWithOpts(
			client.WithAPIVersionNegotiation(),
			client.WithDialContext(dialFunc),
		)
		if err != nil {
			sshConn.Close()
			return nil, fmt.Errorf("error creating docker client: %v", err)
		}
	}

	dc := &DockerClient{
		Cli:  cli,
		SSH:  sshConn,
		Ctx:  context.Background(),
		Node: node,
	}

	return dc, nil
}

type DcResp struct {
	IP           string
	DockerClient *DockerClient
	Err          error
}

func SetDockerClientsMap(platformData *common.PlatformData) (map[string]*DockerClient, error) {
	var swarmErr error = nil
	deploymentLocation := platformData.PlatformInfo.DeploymentLocation
	if deploymentLocation == "" {
		return nil, fmt.Errorf("deployment location is not set")
	}
	nodesData := platformData.PlatformInfo.NodesData

	once.Do(func() {
		sshPrivKey, err := tools.GetSshPrivKey(platformData)
		if err != nil {
			if deploymentLocation == "On-premise cluster deployment" || deploymentLocation == "AWS cluster deployment" {
				swarmErr = fmt.Errorf("error getting SSH private key: %v", err)
				return
			}
		}

		var wg sync.WaitGroup
		dcResponses := make(chan DcResp, len(nodesData))

		spinnerDone := make(chan bool)
		spinnerMsg := "Getting docker clients from each node"
		endMsg := "Docker clients of all nodes have been successfully obtained."
		utils.Spinner(spinnerMsg, endMsg, spinnerDone)
		for _, node := range nodesData {
			wg.Add(1)
			go func(node common.NodeData) {
				defer wg.Done()
				dc, err := getNodeDockerClient(node, deploymentLocation, sshPrivKey)
				dcResponses <- DcResp{IP: node.NodeIP, DockerClient: dc, Err: err}
			}(node)
		}
		wg.Wait()
		close(dcResponses)

		errorLines := []string{}
		for resp := range dcResponses {
			if resp.Err != nil {
				errorLines = append(errorLines, fmt.Sprintf("error getting docker client in node %s: %v", resp.IP, resp.Err.Error()))
				DCMap[resp.IP] = nil
			} else {
				DCMap[resp.IP] = resp.DockerClient
			}
		}
		if len(errorLines) > 0 {
			swarmErr = fmt.Errorf("%s", strings.Join(errorLines, "\n"))
			spinnerDone <- false
		} else {
			spinnerDone <- true
		}
	})

	return DCMap, swarmErr
}

func CheckDockerClientsMap(DCMap map[string]*DockerClient, action string) error {
	if len(DCMap) == 0 {
		return fmt.Errorf("error")
	}
	numManagers := 0
	existNilMap := false
	for _, dc := range DCMap {
		if dc == nil {
			existNilMap = true
		} else {
			if dc.Node.NodeRole == "Manager" {
				numManagers++
			}
		}
	}

	if action == "init" {
		if existNilMap {
			return fmt.Errorf("error")
		}
	} else {
		if numManagers == 0 {
			return fmt.Errorf("error")
		}
	}

	return nil
}

func CloseDockerClientsMap() error {
	for _, dc := range DCMap {
		if dc != nil {
			err := dc.Close()
			if err != nil {
				return fmt.Errorf("error closing docker client: %v", err)
			}
		}
	}

	return nil
}

func CheckSwarmInitiation(platformData *common.PlatformData) (bool, error) {
	nodesData := platformData.PlatformInfo.NodesData
	clusterId := ""
	var managerClient *DockerClient
	for _, node := range nodesData {
		if node.NodeRole == "Manager" {
			dc := DCMap[node.NodeIP]
			if dc == nil {
				return false, fmt.Errorf("error getting docker client for node %s", node.NodeIP)
			}

			info, err := dc.Cli.Info(dc.Ctx)
			if err != nil {
				return false, fmt.Errorf("error getting docker info: %v", err)
			}

			if !info.Swarm.ControlAvailable {
				return false, nil
			} else {
				if info.Swarm.Cluster != nil {
					if clusterId == "" {
						clusterId = info.Swarm.Cluster.ID
					} else if clusterId != info.Swarm.Cluster.ID {
						return false, nil
					}
				}
			}
			if managerClient == nil {
				managerClient = dc
			}
		}
	}

	swarmNodes, err := managerClient.Cli.NodeList(managerClient.Ctx, types.NodeListOptions{})
	if err != nil {
		return false, fmt.Errorf("error listing swarm nodes: %v", err)
	}

	swarmNodeIpMap := make(map[string]swarm.Node)
	for _, node := range swarmNodes {
		swarmNodeIpMap[node.Status.Addr] = node
	}

	for _, node := range nodesData {
		if _, ok := swarmNodeIpMap[node.NodeIP]; !ok {
			return false, nil
		}
	}

	return true, nil
}

func initSwarm() error {
	managerClient, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting manager docker client: %v", err)
	}

	info, err := managerClient.Cli.Info(managerClient.Ctx)
	if err != nil {
		return fmt.Errorf("error getting docker info: %v", err)
	}

	node := managerClient.Node
	if !info.Swarm.ControlAvailable {
		advertiseAddr := fmt.Sprintf("%s:2377", node.NodeIP)
		_, err := managerClient.Cli.SwarmInit(managerClient.Ctx, swarm.InitRequest{
			AdvertiseAddr: advertiseAddr,
			ListenAddr:    "0.0.0.0:2377",
		})
		if err != nil {
			return fmt.Errorf("error initializing swarm: %v", err)
		}
	}

	err = joinAllNodesToSwarm(managerClient)
	if err != nil {
		return fmt.Errorf("error joining nodes to swarm: %v", err)
	} else {
		fmt.Println("Swarm has been initiated successfully")
	}

	return nil
}

func GetImages(dc *DockerClient) error {
	images, err := dc.Cli.ImageList(dc.Ctx, image.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing images: %v", err)
	}

	for _, image := range images {
		fmt.Println(image.ID)
	}

	return nil
}
