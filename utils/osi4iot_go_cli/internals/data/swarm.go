package data

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

type SwarmData struct {
	Secrets  map[string]Secret
	Configs  map[string]Config
	Volumes  map[string]Volume
	Networks map[string]Network
}

var swarmData SwarmData

func InitSwarm() (*client.Client, context.Context, error) {
	ctx := context.Background()

	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("error creating docker client: %v", err)
	}

	info, err := cli.Info(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("error getting docker info: %v", err)
	}

	if !info.Swarm.ControlAvailable {
		_, err := cli.SwarmInit(ctx, swarm.InitRequest{
			AdvertiseAddr: "127.0.0.1",    // tu IP local o la IP real de la interfaz
			ListenAddr:    "0.0.0.0:2377", // por defecto Docker usa este puerto (2377)
		})
		if err != nil {
			return nil, nil, fmt.Errorf("error initializing swarm: %v", err)
		}
	}
	return cli, ctx, nil
}

func RunSwarm() error {
	cli, ctx, err := InitSwarm()
	if err != nil {
		return fmt.Errorf("error initializing swarm: %v", err)
	}

	secrets, err := CreateSwarmSecrets(ctx, cli)
	if err != nil {
		return fmt.Errorf("error creating swarm secrets: %v", err)
	}

	configs, err := CreateSwarmConfigs(ctx, cli)
	if err != nil {
		return fmt.Errorf("error creating swarm configs: %v", err)
	}

	volumes, err := CreateSwarmVolumes(ctx, cli)
	if err != nil {
		return fmt.Errorf("error creating swarm volumes: %v", err)
	}

	networks, err := CreateSwarmNetworks(ctx, cli)
	if err != nil {
		return fmt.Errorf("error creating swarm networks: %v", err)
	}

	swarmData = SwarmData{
		Secrets:  secrets,
		Configs:  configs,
		Volumes:  volumes,
		Networks: networks,
	}

	err = CreateSwarmServices(ctx, cli, swarmData)
	if err != nil {
		return fmt.Errorf("error creating swarm services: %v", err)
	}

	return nil
}

func createSecret(ctx context.Context, cli *client.Client, secretKey string, secret *Secret) error {
	existingSecrets, err := cli.SecretList(ctx, types.SecretListOptions{})
	if err != nil {
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
			err = cli.SecretRemove(ctx, s.ID)
			if err != nil {
				return fmt.Errorf("error removing secret: %v", err)
			}
			break
		}
	}

	if !secretExists {
		secResp, err := cli.SecretCreate(ctx, swarm.SecretSpec{
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

func CreateSwarmSecrets(ctx context.Context, cli *client.Client) (map[string]Secret, error) {
	secrets := GenerateSecrets()
	for key, secret := range secrets {
		err := createSecret(ctx, cli, key, &secret)
		if err != nil {
			return nil, fmt.Errorf("error creating secret %s: %v", key, err)
		}
		secrets[key] = secret
	}

	return secrets, nil
}

func RemoveSwarmSecrets(ctx context.Context, cli *client.Client) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingSecrets, err := cli.SecretList(ctx, types.SecretListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing secrets: %v", err)
	}

	for _, s := range existingSecrets {
		err = cli.SecretRemove(ctx, s.ID)
		if err != nil {
			return fmt.Errorf("error removing secret: %v", err)
		}
	}

	return nil
}

func CreateConfig(ctx context.Context, cli *client.Client, configKey string, config *Config) error {
	existingConfigs, err := cli.ConfigList(ctx, types.ConfigListOptions{})
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
			err = cli.ConfigRemove(ctx, c.ID)
			if err != nil {
				return fmt.Errorf("error removing config: %v", err)
			}
			break
		}
	}

	if !configExists {
		configResp, err := cli.ConfigCreate(ctx, swarm.ConfigSpec{
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

func CreateSwarmConfigs(ctx context.Context, cli *client.Client) (map[string]Config, error) {
	configs := GenerateConfigs()
	for key, config := range configs {
		err := CreateConfig(ctx, cli, key, &config)
		if err != nil {
			return nil, fmt.Errorf("error creating config %s: %v", key, err)
		}
		configs[key] = config
	}

	return configs, nil
}

func RemoveSwarmConfigs(ctx context.Context, cli *client.Client) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingConfigs, err := cli.ConfigList(ctx, types.ConfigListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing configs: %v", err)
	}

	for _, c := range existingConfigs {
		err = cli.ConfigRemove(ctx, c.ID)
		if err != nil {
			return fmt.Errorf("error removing config: %v", err)
		}
	}

	return nil
}

func CreateVolume(ctx context.Context, cli *client.Client, swarmVol *Volume) error {
	existingVolumes, err := cli.VolumeList(ctx, volume.ListOptions{})
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
		vol, err := cli.VolumeCreate(ctx, volume.CreateOptions{
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

func CreateSwarmVolumes(ctx context.Context, cli *client.Client) (map[string]Volume, error) {
	volumes := GenerateVolumes()
	for key, volume := range volumes {
		err := CreateVolume(ctx, cli, &volume)
		if err != nil {
			return nil, fmt.Errorf("error creating volume %s: %v", volume.Name, err)
		}
		volumes[key] = volume
	}

	return volumes, nil
}

func RemoveSwarmVolumes(ctx context.Context, cli *client.Client) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingVolumes, err := cli.VolumeList(ctx, volume.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing volumes: %v", err)
	}

	for _, v := range existingVolumes.Volumes {
		err = cli.VolumeRemove(ctx, v.Name, true)
		if err != nil {
			return fmt.Errorf("error removing volume: %v", err)
		}
	}

	return nil
}

func CreateNetwork(ctx context.Context, cli *client.Client, swarmNetwork *Network) error {
	existingNetworks, err := cli.NetworkList(ctx, network.ListOptions{})
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
		net, err := cli.NetworkCreate(ctx, swarmNetwork.Name, network.CreateOptions{
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

func CreateSwarmNetworks(ctx context.Context, cli *client.Client) (map[string]Network, error) {
	networks := GenerateNetworks()
	for _, network := range networks {
		err := CreateNetwork(ctx, cli, &network)
		if err != nil {
			return nil, fmt.Errorf("error creating network %s: %v", network.Name, err)
		}
	}

	return networks, nil
}

func RemoveSwarmNetworks(ctx context.Context, cli *client.Client) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingNetworks, err := cli.NetworkList(ctx, network.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing networks: %v", err)
	}

	for _, n := range existingNetworks {
		err = cli.NetworkRemove(ctx, n.ID)
		if err != nil {
			return fmt.Errorf("error removing network: %v", err)
		}
	}

	return nil
}

func CreateService(ctx context.Context, cli *client.Client, swarmService Service) error {
	existingServices, err := cli.ServiceList(ctx, types.ServiceListOptions{})
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
		_, err := cli.ServiceCreate(ctx, swarm.ServiceSpec{
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

func CreateSwarmServices(ctx context.Context, cli *client.Client, swarmData SwarmData) error {
	services := GenerateServices(swarmData)
	for _, service := range services {
		err := CreateService(ctx, cli, service)
		if err != nil {
			return fmt.Errorf("error creating service %s: %v", service.Name, err)
		}
	}
	return nil
}

func RemoveSwarmServices(ctx context.Context, cli *client.Client) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingServices, err := cli.ServiceList(ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	for _, s := range existingServices {
		err = cli.ServiceRemove(ctx, s.ID)
		if err != nil {
			return fmt.Errorf("error removing service: %v", err)
		}
	}

	return nil
}

func StopPlatform() error {
	cli, ctx, err := InitSwarm()
	if err != nil {
		return fmt.Errorf("error initializing swarm: %v", err)
	}
	err = RemoveSwarmServices(ctx, cli)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	return nil
}

func DeletePlatform() error {
	cli, ctx, err := InitSwarm()
	if err != nil {
		return fmt.Errorf("error initializing swarm: %v", err)
	}

	done := make(chan bool)
	spinnerMsg := "Waiting for all components to be deleted"
	endMsg := "All components have been deleted successfully"
	utils.Spinner(spinnerMsg, endMsg, done)
	err = RemoveSwarmServices(ctx, cli)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	err = RemoveSwarmSecrets(ctx, cli)
	if err != nil {
		return fmt.Errorf("error removing secrets: %v", err)
	}

	err = RemoveSwarmConfigs(ctx, cli)
	if err != nil {
		return fmt.Errorf("error removing configs: %v", err)
	}

	err = RemoveSwarmNetworks(ctx, cli)
	if err != nil {
		return fmt.Errorf("error removing networks: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	containers, err := cli.ContainerList(context.Background(), container.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing containers: %v", err)
	}

	for {
		if len(containers) == 0 {
			break
		}
		containers, err = cli.ContainerList(context.Background(), container.ListOptions{
			Filters: filterArgs,
		})
		if err != nil {
			return fmt.Errorf("error listing containers: %v", err)
		}
	}

	done <- true
	time.Sleep(5 * time.Second) // wait for containers to stop completely

	err = RemoveSwarmVolumes(ctx, cli)
	if err != nil {
		return fmt.Errorf("error removing volumes: %v", err)
	}

	return nil
}

func WaitUntilAllContainersAreHealthy(serviceType string) error {
	cli, ctx, err := InitSwarm()
	if err != nil {
		return fmt.Errorf("error initializing swarm: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := cli.ServiceList(ctx, types.ServiceListOptions{
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
			tasks, err := cli.TaskList(ctx, types.TaskListOptions{
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

				container, err := cli.ContainerInspect(ctx, containerID)
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

func SetPlatformState(state PlatformStatus) {
	PlatformState = state
}

func GetPlatformState() PlatformStatus {
	return PlatformState
}

func findOrgAndNriIndex(orgAcronym string, nriHash string) (int, int) {
	orgIndex := -1
	nriIndex := -1
	for orgIdx, org := range Data.Certs.MqttCerts.Organizations {
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

func SetNriVolumesAsCreated() (bool, error) {
	areNewNriVolumesCreated := false
	cli, ctx, err := InitSwarm()
	if err != nil {
		return false, fmt.Errorf("error initializing swarm: %v", err)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := cli.ServiceList(ctx, types.ServiceListOptions{
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
		orgIndex, nriIndex := findOrgAndNriIndex(orgAcronym, nriHash)
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
			response, err := cli.ServiceUpdate(ctx, service.ID, service.Version, serviceSpec, types.ServiceUpdateOptions{})
			if err != nil {
				return false, fmt.Errorf("error updating service: %v", err)
			} else {
				if len(response.Warnings) > 0 {
					fmt.Printf("Warnings at updating service %s: %v\n", service.Spec.Name, response.Warnings)
				}
				Data.Certs.MqttCerts.Organizations[orgIndex].NodeRedInstances[nriIndex].IsVolumeCreated = "true"
				areNewNriVolumesCreated = true
			}
		}
	}

	return areNewNriVolumesCreated, nil
}

func SwarmInitiationInfo() error {
	err := WaitUntilAllContainersAreHealthy("all")
	if err != nil {
		errMsg := utils.StyleErrMsg.Render("error waiting for the platform to be healthy: ", err.Error())
		fmt.Println(errMsg)
	} else {
		areNewNriVolumesCreated, err := SetNriVolumesAsCreated()
		if err != nil {
			errMsg := utils.StyleErrMsg.Render("error setting nri volumes as created: ", err.Error())
			fmt.Println(errMsg)
		} else {
			if areNewNriVolumesCreated {
				fmt.Println("")
				err := WaitUntilAllContainersAreHealthy("nodered_instances")
				if err != nil {
					errMsg := utils.StyleErrMsg.Render("error waiting nri is to be healthy: ", err.Error())
					fmt.Println(errMsg)
				} else {
					err = WritePlatformDataToFile()
					if err != nil {
						return fmt.Errorf("error writing platform data to file: %v", err)
					}
					okMsg := utils.StyleOKMsg.Render("Platform is ready to be used")
					fmt.Println(okMsg)
				}
			} else {
				err = WritePlatformDataToFile()
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
