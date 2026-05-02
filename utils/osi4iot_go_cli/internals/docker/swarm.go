package docker

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/errdefs"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/configs"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/networks"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/secrets"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/services"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/volumes"
)

func InitPlatform(platformData *pt.PlatformData) error {
	fmt.Println("Initializing platform...")
	nodesData := platformData.PlatformInfo.NodesData
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

func RunSwarm(dc *pt.DockerClient, pd *pt.PlatformData) error {
	err := createSwarmServices(pd, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm services: %v", err)
	}

	return nil
}

func createSwarmServices(platformData *pt.PlatformData, dc *pt.DockerClient) error {
	createdSecrets, err := secrets.CreateSwarmSecrets(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm secrets: %v", err)
	}

	createdConfigs, err := configs.CreateSwarmConfigs(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm configs: %v", err)
	}

	volumesMap := volumes.GenerateVolumes(platformData)
	createdVolumes, err := volumes.CreateSwarmVolumes(platformData, volumesMap)
	if err != nil {
		return fmt.Errorf("error creating swarm volumes: %v", err)
	}

	createdNetworks, err := networks.CreateSwarmNetworks(platformData, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm networks: %v", err)
	}

	if err := waitForSwarmResources(dc, createdSecrets, createdConfigs, createdNetworks); err != nil {
		return fmt.Errorf("error waiting for swarm resources to be available: %v", err)
	}

	swarmData := pt.SwarmData{
		Secrets:  createdSecrets,
		Configs:  createdConfigs,
		Volumes:  createdVolumes,
		Networks: createdNetworks,
	}

	services := services.GenerateServices(platformData, swarmData)
	for _, service := range services {
		if err := CreateSwarmService(dc, service); err != nil {
			return fmt.Errorf("error creating service '%s': %v", service.Name, err)
		}
	}

	if err := waitUntilAllContainersAreHealthy(platformData, "all"); err != nil {
		return fmt.Errorf("error waiting for all containers to be healthy: %v", err)
	}


	allServiceNames := utils.GetAllServiceNames(platformData)
	
	knownSecretKeys := secrets.GetKnownSecretKeys(platformData)
	if err := secrets.RemoveOrphanSecrets(dc, allServiceNames, knownSecretKeys); err != nil {
		fmt.Printf("Warning: could not clean up orphan secrets: %v\n", err)
	}

	knownConfigKeys := configs.GetKnownConfigKeys(platformData)
	if err := configs.RemoveOrphanConfigs(dc, allServiceNames, knownConfigKeys); err != nil {
		fmt.Printf("Warning: could not clean up orphan configs: %v\n", err)
	}

	return nil
}

// waitForSwarmResources checks if the created secrets, configs, and networks are available in the swarm by inspecting them.
// It retries the inspection multiple times with a delay in between to allow for propagation across the swarm.
func waitForSwarmResources(
	dc *pt.DockerClient,
	createdSecrets map[string]pt.Secret,
	createdConfigs map[string]pt.Config,
	createdNetworks map[string]pt.Network,
) error {
	maxAttempts := 120
	interval := 500 * time.Millisecond

	secretIDs := make([]string, 0, len(createdSecrets))
	for _, s := range createdSecrets {
		secretIDs = append(secretIDs, s.ID)
	}
	configIDs := make([]string, 0, len(createdConfigs))
	for _, c := range createdConfigs {
		configIDs = append(configIDs, c.ID)
	}
	networkIDs := make([]string, 0, len(createdNetworks))
	for _, n := range createdNetworks {
		networkIDs = append(networkIDs, n.ID)
	}

	done := make(chan bool)
	utils.Spinner("Waiting for swarm resources to propagate", "Swarm resources are ready", done)

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		allReady := true

		for _, id := range secretIDs {
			if _, _, err := dc.Cli.SecretInspectWithRaw(dc.Ctx, id); err != nil {
				allReady = false
				break
			}
		}

		if allReady {
			for _, id := range configIDs {
				if _, _, err := dc.Cli.ConfigInspectWithRaw(dc.Ctx, id); err != nil {
					allReady = false
					break
				}
			}
		}

		if allReady {
			for _, id := range networkIDs {
				if _, err := dc.Cli.NetworkInspect(dc.Ctx, id, network.InspectOptions{}); err != nil {
					allReady = false
					break
				}
			}
		}

		if allReady {
			done <- true
			return nil
		}

		time.Sleep(interval)
	}

	done <- false
	return fmt.Errorf("swarm resources not available after %d attempts (%s)",
		maxAttempts, time.Duration(maxAttempts)*interval)
}

func CreateSwarmService(dc *pt.DockerClient, swarmService pt.Service) error {
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
			Annotations:    swarmService.Annotations,
			TaskTemplate:   swarmService.TaskTemplate,
			EndpointSpec:   swarmService.EndpointSpec,
			Mode:           swarmService.Mode,
			UpdateConfig:   swarmService.UpdateConfig,
			RollbackConfig: swarmService.RollbackConfig,
		}, types.ServiceCreateOptions{})
		if err != nil {
			return fmt.Errorf("error creating service: %v", err)
		}
	}
	return nil
}

func removeSwarmServices(dc *pt.DockerClient) error {
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

func StopPlatform(platformData *pt.PlatformData) error {
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

func DeletePlatform(platformData *pt.PlatformData) error {
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

	err = secrets.RemoveSwarmSecrets(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing secrets: %v", err)
	}

	err = configs.RemoveSwarmConfigs(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing configs: %v", err)
	}

	err = networks.RemoveSwarmNetworks(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing networks: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	containers, err := docker.Cli.ContainerList(docker.Ctx, container.ListOptions{
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
		containers, err = docker.Cli.ContainerList(docker.Ctx, container.ListOptions{
			Filters: filterArgs,
		})
		if err != nil {
			if errdefs.IsNotFound(err) {
				continue
			}
			done <- false
			return fmt.Errorf("error listing containers: %v", err)
		}
	}

	timeOut := false
	for i := 0; i <= 60; i++ {
		time.Sleep(1 * time.Second) // wait for containers to stop completely
		err = volumes.RemoveSwarmVolumes(platformData)
		if err == nil {
			break
		}
		if i == 60 {
			timeOut = true
		}
	}

	if timeOut {
		done <- false
		return fmt.Errorf("error timeout removing volumes: %v", err)
	}
	done <- true

	err = removeNfsRootFolder(platformData)
	if err != nil {
		return fmt.Errorf("error removing NFS root folder: %v", err)
	}

	err = removeEfsRootFolder(platformData)
	if err != nil {
		return fmt.Errorf("error removing EFS root folder: %v", err)
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

func waitUntilAllContainersAreHealthy(pd *pt.PlatformData, serviceType string) error {
	if slices.Contains(pd.PlatformInfo.ExcludedServices, serviceType) {
		return nil
	}

	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	deadline := time.Now().Add(10 * time.Minute)

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := docker.Cli.ServiceList(docker.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	var filteredServices []swarm.Service
	if serviceType != "all" {
		for _, service := range services {
			val, ok := service.Spec.Labels["service_type"]
			if ok {
				if strings.Contains(val, "nats") && serviceType == "nats" {
					filteredServices = append(filteredServices, service)
				} else if val == serviceType {
					filteredServices = append(filteredServices, service)
				}
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
		if time.Now().After(deadline) {
			done <- false
			return fmt.Errorf("timeout waiting for all containers to be healthy")
		}

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
				allHealthy = false
				continue
			}

			numTasksRunning := 0
			for _, task := range tasks {
				if task.Status.State != swarm.TaskStateRunning {
					continue
				}
				numTasksRunning++

				containerID := task.Status.ContainerStatus.ContainerID
				if containerID == "" {
					allHealthy = false
					continue
				}

				container, err := docker.Cli.ContainerInspect(docker.Ctx, containerID)
				if err != nil {
					if errdefs.IsNotFound(err) {
						continue
					}
					allHealthy = false
					continue
				}

				if container.State.Health == nil {
					done <- false
					return fmt.Errorf("error container %s does not have a health check configured", containerID[:10])
				}

				if container.State.Health.Status != "healthy" {
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

		time.Sleep(5 * time.Second)
	}

	done <- true

	return nil
}

func SwarmInitiationInfo(platformData *pt.PlatformData, okMessage string) error {
	err := utils.WritePlatformDataToFile(platformData)
	if err != nil {
		return fmt.Errorf("error writing platform data to file: %v", err)
	}
	okMsg := utils.StyleOKMsg.Render(okMessage)
	fmt.Println(okMsg)

	return nil
}

func CheckSwarmInitiation(platformData *pt.PlatformData) (bool, error) {
	nodesData := platformData.PlatformInfo.NodesData
	clusterId := ""
	var managerClient *pt.DockerClient
	for _, node := range nodesData {
		if node.NodeRole == "Manager" {
			dc := pt.DCMap[node.NodeIP]
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
	nodeIP := node.NodeIP
	if nodeIP == "localhost" {
		nodeIP, err = utils.GetLocalNodeIP()
		if err != nil {
			return fmt.Errorf("error getting local node IP: %v", err)
		}
	}
	if !info.Swarm.ControlAvailable {
		advertiseAddr := fmt.Sprintf("%s:2377", nodeIP)
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

func GetImages(dc *pt.DockerClient) error {
	images, err := dc.Cli.ImageList(dc.Ctx, image.ListOptions{})
	if err != nil {
		return fmt.Errorf("error listing images: %v", err)
	}

	for _, image := range images {
		fmt.Println(image.ID)
	}

	return nil
}

func CleanResources() error {
	if err := RemoveSshPrivKeyTempFile(); err != nil {
		return fmt.Errorf("error removing ssh private key temp file: %v", err)
	}

	if err := CloseDockerClientsMap(); err != nil {
		return fmt.Errorf("error closing resources: %v", err)
	}
	return nil
}
