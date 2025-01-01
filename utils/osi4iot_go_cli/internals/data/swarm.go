package data

import (
	"context"
	"fmt"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
)

type SwarmData struct {
	Secrets map[string]Secret
	Configs map[string]Config
	Volumes map[string]Volume
	Networks map[string]Network
}

var swarmData SwarmData

func RunSwarm() error {
	ctx := context.Background()

	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return fmt.Errorf("error creating docker client: %v", err)
	}

	info, err := cli.Info(ctx)
	if err != nil {
		return fmt.Errorf("error getting docker info: %v", err)
	}

	if !info.Swarm.ControlAvailable {
		// inicializamos el swarm
		_, err := cli.SwarmInit(ctx, swarm.InitRequest{
			AdvertiseAddr: "127.0.0.1",    // tu IP local o la IP real de la interfaz
			ListenAddr:    "0.0.0.0:2377", // por defecto Docker usa este puerto (2377)
		})
		if err != nil {
			return fmt.Errorf("error initializing swarm: %v", err)
		}
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
		Secrets: secrets,
		Configs: configs,
		Volumes: volumes,
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
	existingSecrets, err := cli.SecretList(ctx, types.SecretListOptions{})
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
	existingConfigs, err := cli.ConfigList(ctx, types.ConfigListOptions{})
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
	existingVolumes, err := cli.VolumeList(ctx, volume.ListOptions{})
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
		_, err := cli.NetworkCreate(ctx, swarmNetwork.Name, network.CreateOptions{
			Driver: swarmNetwork.Driver,
			Attachable: true,
		})
		if err != nil {
			return fmt.Errorf("error creating network: %v", err)
		}
	}

	return nil
}

func CreateSwarmNetworks(ctx context.Context, cli *client.Client) (map[string]Network,error) {
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
	existingNetworks, err := cli.NetworkList(ctx, network.ListOptions{})
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
			Annotations: swarmService.Annotations,
			TaskTemplate: swarmService.TaskTemplate,
			EndpointSpec: swarmService.EndpointSpec,
			Mode: swarmService.Mode,
			Networks: swarmService.Networks,
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
