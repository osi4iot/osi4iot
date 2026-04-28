package docker

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/configs"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/networks"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/secrets"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/services"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/volumes"
)

// SecretUpdateConfig contains the configuration to update a secret
type SecretUpdateConfig struct {
	SecretKey     string
	SecretID      string
	NewSecretName string
	OldSecretName string
	NewSecretData string
	TargetFile    string // Path of the file inside the container (e.g., "/run/secrets/db-password")
}

// ConfigUpdateConfig contains the configuration to update a config
type ConfigUpdateConfig struct {
	ConfigKey     string
	NewConfigName string
	OldConfigName string
	NewConfigData string
	TargetFile    string // Path of the file inside the container
}

// ResourcesConfig contains the resource configuration for the service
type ResourcesUpdateConfig struct {
	CPULimit          int64 // CPU limit in nanocpus (1 CPU = 1000000000)
	CPUReservation    int64 // CPU reservation in nanocpus
	MemoryLimit       int64 // Memory limit in bytes
	MemoryReservation int64 // Memory reservation in bytes
}

// ServiceUpdateOptions contains all options to update a service
type ServiceUpdateOptions struct {
	Replicas      *uint64
	SecretsUpdate []SecretUpdateConfig
	ConfigsUpdate []ConfigUpdateConfig
	Resources     *ResourcesUpdateConfig
	Image         *string           // Update container image
	Env           map[string]string // Update environment variables (add or modify)
	RemoveEnv     []string          // Environment variables to remove
}

func ServiceUpdate(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	service *swarm.Service,
	serviceName string,
	options ServiceUpdateOptions,
) (string, error) {
	var oldSecretIDs []string
	var oldConfigIDs []string
	warningMessages := ""
	serviceUpdateOptions := types.ServiceUpdateOptions{}

	// Determine if this is a rolling update (anything other than just replica scaling)
	isRollingUpdate := len(options.SecretsUpdate) > 0 ||
		len(options.ConfigsUpdate) > 0 ||
		options.Resources != nil ||
		options.Image != nil ||
		len(options.Env) > 0 ||
		len(options.RemoveEnv) > 0

	// Get target replicas (current or new)
	targetReplicas := uint64(0)
	if service.Spec.Mode.Replicated != nil && service.Spec.Mode.Replicated.Replicas != nil {
		targetReplicas = *service.Spec.Mode.Replicated.Replicas
	}
	if options.Replicas != nil {
		targetReplicas = *options.Replicas
	}

	// 1. Update replicas if specified
	if options.Replicas != nil {
		if service.Spec.Mode.Replicated == nil {
			service.Spec.Mode.Replicated = &swarm.ReplicatedService{}
		}
		service.Spec.Mode.Replicated.Replicas = options.Replicas
	}

	// 2. Update secrets if specified
	if len(options.SecretsUpdate) > 0 {
		for _, secretUpdate := range options.SecretsUpdate {
			// Find and replace the secret reference in the service
			secretFound := false
			for i, secretRef := range service.Spec.TaskTemplate.ContainerSpec.Secrets {
				if secretRef.SecretName == secretUpdate.OldSecretName {
					oldSecretIDs = append(oldSecretIDs, secretRef.SecretID)

					// Determine the target file
					targetFile := secretUpdate.TargetFile
					if targetFile == "" && secretRef.File != nil {
						targetFile = secretRef.File.Name
					}

					// Create new reference
					newSecretRef := &swarm.SecretReference{
						SecretID:   secretUpdate.SecretID,
						SecretName: secretUpdate.NewSecretName,
						File: &swarm.SecretReferenceFileTarget{
							Name: targetFile,
							UID:  "0",
							GID:  "0",
							Mode: 0444,
						},
					}

					service.Spec.TaskTemplate.ContainerSpec.Secrets[i] = newSecretRef
					secretFound = true
					break
				}
			}

			if !secretFound {
				return "", fmt.Errorf("secret %s not found in service %s", secretUpdate.NewSecretName, serviceName)
			}
		}
	}

	// 3. Update configs if specified
	if len(options.ConfigsUpdate) > 0 {
		for _, configUpdate := range options.ConfigsUpdate {
			// Create the new config with hash
			configHash := utils.GetMD5Hash(configUpdate.NewConfigData)
			newConfigName := fmt.Sprintf("%s_%s", configUpdate.ConfigKey, configHash)
			newConfig := pt.Config{
				Name: newConfigName,
				Data: configUpdate.NewConfigData,
			}
			configCreateResponse, err := configs.CreateConfig(dc, configUpdate.ConfigKey, &newConfig)
			if err != nil {
				return "", fmt.Errorf("error creating new config %s: %v", newConfigName, err)
			}

			// Find and replace the config reference in the service
			configFound := false
			for i, configRef := range service.Spec.TaskTemplate.ContainerSpec.Configs {
				if configRef.ConfigName == configUpdate.OldConfigName {
					oldConfigIDs = append(oldConfigIDs, configRef.ConfigID)

					// Determine the target file
					targetFile := configUpdate.TargetFile
					if targetFile == "" && configRef.File != nil {
						targetFile = configRef.File.Name
					}

					// Create new reference
					newConfigRef := &swarm.ConfigReference{
						ConfigID:   configCreateResponse.ID,
						ConfigName: newConfigName,
						File: &swarm.ConfigReferenceFileTarget{
							Name: targetFile,
							UID:  "0",
							GID:  "0",
							Mode: 0444,
						},
					}

					service.Spec.TaskTemplate.ContainerSpec.Configs[i] = newConfigRef
					configFound = true
					break
				}
			}

			if !configFound {
				return "", fmt.Errorf("config %s not found in service %s", configUpdate.ConfigKey, serviceName)
			}
		}
	}

	// 4. Update resources if specified
	if options.Resources != nil {
		if service.Spec.TaskTemplate.Resources == nil {
			service.Spec.TaskTemplate.Resources = &swarm.ResourceRequirements{}
		}

		// Limits
		if options.Resources.CPULimit > 0 || options.Resources.MemoryLimit > 0 {
			if service.Spec.TaskTemplate.Resources.Limits == nil {
				service.Spec.TaskTemplate.Resources.Limits = &swarm.Limit{}
			}
			if options.Resources.CPULimit > 0 {
				service.Spec.TaskTemplate.Resources.Limits.NanoCPUs = options.Resources.CPULimit
			}
			if options.Resources.MemoryLimit > 0 {
				service.Spec.TaskTemplate.Resources.Limits.MemoryBytes = options.Resources.MemoryLimit
			}
		}

		// Reservations
		if options.Resources.CPUReservation > 0 || options.Resources.MemoryReservation > 0 {
			if service.Spec.TaskTemplate.Resources.Reservations == nil {
				service.Spec.TaskTemplate.Resources.Reservations = &swarm.Resources{}
			}
			if options.Resources.CPUReservation > 0 {
				service.Spec.TaskTemplate.Resources.Reservations.NanoCPUs = options.Resources.CPUReservation
			}
			if options.Resources.MemoryReservation > 0 {
				service.Spec.TaskTemplate.Resources.Reservations.MemoryBytes = options.Resources.MemoryReservation
			}
		}
	}

	// 5. Update image if specified
	if options.Image != nil {
		service.Spec.TaskTemplate.ContainerSpec.Image = *options.Image
	}

	// 6. Update environment variables
	if len(options.Env) > 0 || len(options.RemoveEnv) > 0 {
		// Create a map of existing variables
		envMap := make(map[string]string)
		for _, envVar := range service.Spec.TaskTemplate.ContainerSpec.Env {
			// Parse KEY=VALUE
			for i := 0; i < len(envVar); i++ {
				if envVar[i] == '=' {
					key := envVar[:i]
					value := envVar[i+1:]
					envMap[key] = value
					break
				}
			}
		}

		// Remove specified variables
		for _, key := range options.RemoveEnv {
			delete(envMap, key)
		}

		// Add or update variables
		for key, value := range options.Env {
			envMap[key] = value
		}

		// Rebuild the environment variables slice
		newEnv := make([]string, 0, len(envMap))
		for key, value := range envMap {
			newEnv = append(newEnv, fmt.Sprintf("%s=%s", key, value))
		}
		service.Spec.TaskTemplate.ContainerSpec.Env = newEnv
	}

	// 7. Update the service with all changes
	response, err := dc.Cli.ServiceUpdate(dc.Ctx, service.ID, service.Version, service.Spec, serviceUpdateOptions)
	if err != nil {
		return "", fmt.Errorf("error updating service %s: %v", serviceName, err)
	}

	// 8. Monitor the update progress
	if isRollingUpdate {
		// Monitor rolling update (secrets, configs, image, resources, env changes)
		err = utils.MonitorServiceRollingUpdate(dc, service.ID, targetReplicas)
		if err != nil {
			return "", fmt.Errorf("error monitoring service update: %v", err)
		}
	} else if options.Replicas != nil {
		// Monitor simple scaling operation
		err = utils.MonitorServiceScaleWithProgressBar(dc, service.ID, targetReplicas)
		if err != nil {
			return "", fmt.Errorf("error monitoring service scale: %v", err)
		}
	}

	// 9. Process warnings
	if len(response.Warnings) > 0 {
		for _, warning := range response.Warnings {
			warningMessages += fmt.Sprintf("  - %s\n", warning)
		}
	}

	// 10. Update platform data if replicas were changed
	if options.Replicas != nil {
		svcIdx, svcData, err := utils.FindServiceDataByName(pd, serviceName)
		if err != nil {
			return warningMessages, fmt.Errorf("error finding service data: %v", err)
		}

		svcData.Replicas = int(*options.Replicas)
		pd.PlatformInfo.ServicesData[svcIdx] = *svcData
		err = utils.WritePlatformDataToFile(pd)
		if err != nil {
			return warningMessages, fmt.Errorf("error writing platform data to file: %v", err)
		}
	}

	// 11. Wait before removing old secrets and configs (give time for rolling update)
	if len(oldSecretIDs) > 0 || len(oldConfigIDs) > 0 {
		// Wait for old tasks to finish
		time.Sleep(10 * time.Second)

		// Remove old secrets
		for _, oldSecretID := range oldSecretIDs {
			err := dc.Cli.SecretRemove(dc.Ctx, oldSecretID)
			if err != nil {
				warningMessages += fmt.Sprintf("  - Warning: Could not remove old secret %s: %v\n", oldSecretID, err)
			}
		}

		// Remove old configs
		for _, oldConfigID := range oldConfigIDs {
			err := dc.Cli.ConfigRemove(dc.Ctx, oldConfigID)
			if err != nil {
				warningMessages += fmt.Sprintf("  - Warning: Could not remove old config %s: %v\n", oldConfigID, err)
			}
		}
	}

	return warningMessages, nil
}

func RemoveSwarmServicesByName(dc *pt.DockerClient, svcNamesToRemove []string) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	errors := []string{}
	for _, service := range services {
		serviceName := service.Spec.Name
		if slices.Contains(svcNamesToRemove, serviceName) {
			err := dc.Cli.ServiceRemove(dc.Ctx, service.ID)
			if err != nil {
				errors = append(errors, fmt.Sprintf("error removing service %s: %v", serviceName, err))
			}
		}
	}
	if len(errors) > 0 {
		return fmt.Errorf("%s", strings.Join(errors, "\n"))
	}

	return nil
}

func ListSwarmServices(dc *pt.DockerClient) ([]swarm.Service, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})

	if err != nil {
		return nil, fmt.Errorf("error listing services: %v", err)
	}

	return services, nil
}

func InspectService(dc *pt.DockerClient, serviceName string) (*swarm.Service, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	filterArgs.Add("name", serviceName)
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing services: %v", err)
	}

	if len(services) == 0 {
		return nil, fmt.Errorf("service %s not found", serviceName)
	}

	return &services[0], nil
}

func GetSwarmNetworks(dc *pt.DockerClient) ([]network.Summary, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	networks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing networks: %v", err)
	}

	return networks, nil
}

func GetServiceNetworks(dc *pt.DockerClient, service *swarm.Service) ([]network.Summary, error) {
	var networkIDs []string
	for _, net := range service.Spec.TaskTemplate.Networks {
		networkIDs = append(networkIDs, net.Target)
	}

	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	networks, err := dc.Cli.NetworkList(dc.Ctx, network.ListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing networks: %v", err)
	}

	var serviceNetworks []network.Summary
	for _, net := range networks {
		if slices.Contains(networkIDs, net.ID) {
			serviceNetworks = append(serviceNetworks, net)
		}
	}

	return serviceNetworks, nil
}

func GetNatsReplicas(dc *pt.DockerClient) (uint64, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return 0, fmt.Errorf("error listing services: %v", err)
	}

	if len(services) == 0 {
		return 0, fmt.Errorf("no services found")
	}

	natsReplicas := 0
	for _, service := range services {
		if val, ok := service.Spec.Labels["service_type"]; ok && strings.Contains(val, "nats") {
			natsReplicas++
		}
	}

	return uint64(natsReplicas), nil
}

func UpdateSwarmServiceResources(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	serviceName string,
	mem int64,
	cpu float64,
) (string, error) {
	service, err := InspectService(dc, serviceName)
	if err != nil {
		return "", fmt.Errorf("error inspecting service: %v", err)
	}

	cpuNano := int64(cpu * 1e9)
	memoryBytes := mem * 1024 * 1024
	updateOptions := ServiceUpdateOptions{
		Resources: &ResourcesUpdateConfig{
			CPULimit:          cpuNano,
			CPUReservation:    cpuNano,
			MemoryLimit:       memoryBytes,
			MemoryReservation: memoryBytes,
		},
	}
	warningMessages, err := ServiceUpdate(pd, dc, service, serviceName, updateOptions)
	if err != nil {
		return "", fmt.Errorf("error updating service resources: %v", err)
	}

	svcIdx, svcData, err := utils.FindServiceDataByName(pd, serviceName)
	if err != nil {
		return "", fmt.Errorf("error finding service data: %v", err)
	}

	svcData.Cpu = fmt.Sprintf("%sCPU", strconv.FormatFloat(cpu, 'f', 2, 64))
	svcData.Memory = fmt.Sprintf("%sMb", strconv.FormatInt(mem, 10))
	pd.PlatformInfo.ServicesData[svcIdx] = *svcData
	err = utils.WritePlatformDataToFile(pd)
	if err != nil {
		return "", fmt.Errorf("error writing platform data to file: %v", err)
	}

	return warningMessages, nil
}

func UpdateSwarmServiceImage(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	serviceName string,
	image string,
) (string, error) {
	service, err := InspectService(dc, serviceName)
	if err != nil {
		return "", fmt.Errorf("error inspecting service: %v", err)
	}

	updateOptions := ServiceUpdateOptions{
		Image: &image,
	}
	warningMessages, err := ServiceUpdate(pd, dc, service, serviceName, updateOptions)
	if err != nil {
		return "", fmt.Errorf("error updating service image: %v", err)
	}

	svcIdx, svcData, err := utils.FindServiceDataByName(pd, serviceName)
	if err != nil {
		return "", fmt.Errorf("error finding service data: %v", err)
	}

	svcData.Image = image
	pd.PlatformInfo.ServicesData[svcIdx] = *svcData
	err = utils.WritePlatformDataToFile(pd)
	if err != nil {
		return "", fmt.Errorf("error writing platform data to file: %v", err)
	}

	return warningMessages, nil
}

func ScaleSwarmService(pd *pt.PlatformData, dc *pt.DockerClient, serviceName string, replicas uint64) (string, error) {
	var currentReplicas uint64
	var service *swarm.Service
	var err error
	if serviceName == "nats" {
		if serviceName == "nats" && utils.IsEven(replicas) {
			errMsg := "NATS service requires an odd number of replicas: (1, 3, 5, ...)"
			return "", fmt.Errorf("%s", errMsg)
		}

		currentReplicas, err = GetNatsReplicas(dc)
		if err != nil {
			return "", fmt.Errorf("error getting current nats replicas: %v", err)
		}
	} else {
		service, err = InspectService(dc, serviceName)
		if err != nil {
			return "", fmt.Errorf("error inspecting service: %v", err)
		}

		if service.Spec.Mode.Replicated == nil {
			return "", fmt.Errorf("service '%s' is in global mode and cannot be scaled", serviceName)
		}

		currentReplicas = *service.Spec.Mode.Replicated.Replicas
		if currentReplicas == replicas {
			message := fmt.Sprintf("Service '%s' is already scaled to %d replicas", serviceName, replicas)
			return message, nil
		}
	}

	pi := pd.PlatformInfo
	warningMessages := ""
	switch serviceName {
	case "pipelines":
		for replica := currentReplicas + 1; replica <= replicas; replica++ {
			err = volumes.CreatePipelinesVolume(pi, dc, int(replica))
			if err != nil {
				return "", fmt.Errorf("error creating pipelines volume for new replica %d: %v", replica, err)
			}
		}
		updateOptions := ServiceUpdateOptions{
			Replicas: &replicas,
		}
		warningMessages, err = ServiceUpdate(pd, dc, service, serviceName, updateOptions)
		if err != nil {
			return "", fmt.Errorf("error updating pipelines service: %v", err)
		}

		if replicas < currentReplicas {
			time.Sleep(10 * time.Second) // Wait for the service to stabilize
			for replica := replicas + 1; replica <= currentReplicas; replica++ {
				fmt.Println("Removing pipelines volume for removed replica", replica)
				err = volumes.RemovePipelinesVolume(dc, int(replica))
				if err != nil {
					return "", fmt.Errorf("error removing pipelines volume for removed replica %d: %v", replica, err)
				}
			}
		}
	case "nats":
		// Fase 1: Create new nats config secret
		numNodes := len(pd.PlatformInfo.NodesData)
		oldNatsConfigSecret, err := secrets.GetSecretByKey(dc, "nats_config")
		if err != nil {
			return "", fmt.Errorf("error getting old nats config secret: %v", err)
		}

		natsConfigSecret := secrets.CreateNatsConfigSecret(pd, int(replicas))
		err = secrets.CreateSecretByName(dc, &natsConfigSecret)
		if err != nil {
			return "", fmt.Errorf("error creating secret nats_config: %v", err)
		}
		secretUpdateConfig := SecretUpdateConfig{
			SecretKey:     "nats_config",
			SecretID:      natsConfigSecret.ID,
			NewSecretName: natsConfigSecret.Name,
			OldSecretName: oldNatsConfigSecret.Name,
			NewSecretData: natsConfigSecret.Data,
			TargetFile:    "/etc/nats/nats.conf",
		}
		updateOptions := ServiceUpdateOptions{
			SecretsUpdate: []SecretUpdateConfig{secretUpdateConfig},
		}

		// Fase 2: Scale up nats services if needed
		for replica := currentReplicas + 1; replica <= replicas; replica++ {
			err = CreateNatsService(pd, dc, int(replica), int(replicas), natsConfigSecret)
			if err != nil {
				return "", fmt.Errorf("error creating nats service for new replica %d: %v", replica, err)
			}
		}

		// Fase 3: Scale down nats services if needed
		if replicas < currentReplicas {
			fmt.Println("Removing extra nats services")
			for replica := replicas + 1; replica <= currentReplicas; replica++ {
				err = RemoveNatsService(dc, int(replica))
				if err != nil {
					return "", err
				}
			}
			time.Sleep(10 * time.Second) // Wait for the services to stabilize
		}

		// Fase 4: Update existing nats services to new configuration
		if AreNeededNatsDependentServiceUpdates(currentReplicas, replicas) {
			fmt.Println("\nUpdating existing nats services to new configuration")
			existingNatsServices := utils.Min(int(currentReplicas), int(replicas))
			for replica := 1; replica <= existingNatsServices; replica++ {
				natsServiceName := fmt.Sprintf("nats%d", replica)
				fmt.Printf("\nUpdating nats service %s:", natsServiceName)
				service, err := InspectService(dc, natsServiceName)
				if err != nil {
					return "", fmt.Errorf("error inspecting nats service %s: %v", natsServiceName, err)
				}
				if numNodes == 1 && replicas > 1 {
					service.Spec.UpdateConfig.Order = swarm.UpdateOrderStopFirst
					service.Spec.RollbackConfig.Order = swarm.UpdateOrderStopFirst
				}
				warningMessages, err = ServiceUpdate(pd, dc, service, natsServiceName, updateOptions)
				if err != nil {
					return "", fmt.Errorf("error updating nats service: %v", err)
				}
				if warningMessages != "" {
					fmt.Println(warningMessages)
				}
			}
		}

		// Fase 5: Check health of all nats containers
		err = waitUntilAllContainersAreHealthy(pd, "nats")
		if err != nil {
			return "", fmt.Errorf("error waiting for nats containers to be healthy: %v", err)
		}

		// Fase 6: Update nats dependent services to use new nats config secret
		if AreNeededNatsDependentServiceUpdates(currentReplicas, replicas) {
			natsDependentServices := []string{"admin_api", "pipelines"}
			secretsKeys := map[string]string{
				"admin_api": "admin_api",
				"pipelines": "pipelines_config",
			}
			targetFiles := map[string]string{
				"admin_api": "admin_api.txt",
				"pipelines": "/pipelines/config.yaml",
			}
			for _, dependentService := range natsDependentServices {
				fmt.Printf("\nUpdating %s service to use new nats config:", dependentService)
				service, err := InspectService(dc, dependentService)
				if err != nil {
					return "", fmt.Errorf("error inspecting %s service: %v", dependentService, err)
				}

				oldSecret, err := secrets.GetSecretByKey(dc, secretsKeys[dependentService])
				if err != nil {
					return "", fmt.Errorf("error getting old secret for %s service: %v", dependentService, err)
				}

				newSecret, err := CreateNatsDependentServiceSecrets(pd, dc, dependentService, int(replicas))
				if err != nil {
					return "", fmt.Errorf("error creating new secret for %s service: %v", dependentService, err)
				}
				secretUpdateConfig := SecretUpdateConfig{
					SecretKey:     secretsKeys[dependentService],
					SecretID:      newSecret.ID,
					NewSecretName: newSecret.Name,
					OldSecretName: oldSecret.Name,
					NewSecretData: newSecret.Data,
					TargetFile:    targetFiles[dependentService],
				}
				updateOptions := ServiceUpdateOptions{
					SecretsUpdate: []SecretUpdateConfig{secretUpdateConfig},
				}
				warningMessages, err = ServiceUpdate(pd, dc, service, dependentService, updateOptions)
				if err != nil {
					return "", fmt.Errorf("error updating %s service: %v", dependentService, err)
				}
				if warningMessages != "" {
					fmt.Println(warningMessages)
				}
			}
		}

	default:
		updateOptions := ServiceUpdateOptions{
			Replicas: &replicas,
		}
		warningMessages, err = ServiceUpdate(pd, dc, service, serviceName, updateOptions)
	}

	svcIdx, svcData, err := utils.FindServiceDataByName(pd, serviceName)
	if err != nil {
		return "", fmt.Errorf("error finding service data: %v", err)
	}

	svcData.Replicas = int(replicas)
	pd.PlatformInfo.ServicesData[svcIdx] = *svcData
	err = utils.WritePlatformDataToFile(pd)
	if err != nil {
		return "", fmt.Errorf("error writing platform data to file: %v", err)
	}

	return warningMessages, nil
}

func AreNeededNatsDependentServiceUpdates(currentNumNatsReplicas, numNatsReplicas uint64) bool {
	needUpdate := false
	if currentNumNatsReplicas == 1 && numNatsReplicas >= 3 {
		needUpdate = true
	}
	if currentNumNatsReplicas >= 3 && numNatsReplicas == 1 {
		needUpdate = true
	}
	return needUpdate
}

func CreateNatsDependentServiceSecrets(pd *pt.PlatformData, dc *pt.DockerClient, serviceName string, numNatsReplicas int) (pt.Secret, error) {
	switch serviceName {
	case "admin_api":
		adminApiSecret := secrets.CreateAdminApiConfigSecret(pd, numNatsReplicas)
		secrets.CreateSecretByName(dc, &adminApiSecret)
		return adminApiSecret, nil
	case "pipelines":
		pipelinesSecret := secrets.CreatePipelinesConfigSecret(pd, numNatsReplicas)
		secrets.CreateSecretByName(dc, &pipelinesSecret)
		return pipelinesSecret, nil
	default:
		return pt.Secret{}, fmt.Errorf("service %s is not a nats dependent service", serviceName)
	}
}

func CreateNatsService(pd *pt.PlatformData, dc *pt.DockerClient, replica int, numNatsReplicas int, natsConfigSecret pt.Secret) error {
	pi := pd.PlatformInfo
	natsVolume, err := volumes.CreateNatsVolume(pi, dc, int(replica))
	if err != nil {
		return fmt.Errorf("error creating nats volume for new replica %d: %v", replica, err)
	}

	var sd pt.SwarmData
	sd.Networks = make(map[string]pt.Network)
	internalNetwork, err := networks.GetNetworkByName(dc, "internal_net")
	if err != nil {
		return fmt.Errorf("error getting internal network: %v", err)
	}
	sd.Networks["internal_net"] = *internalNetwork

	natsNetwork, err := networks.GetNetworkByName(dc, "nats_network")
	if err != nil {
		return fmt.Errorf("error getting nats network: %v", err)
	}
	sd.Networks["nats_network"] = *natsNetwork

	sd.Secrets = make(map[string]pt.Secret)
	if pd.PlatformInfo.UseCustomNatsCACert == "Yes" {
		caCerts, err := secrets.GetSecretByKey(dc, "iot_platform_ca")
		if err != nil {
			return fmt.Errorf("error getting nats secrets: %v", err)
		}
		sd.Secrets["iot_platform_ca_cert"] = *caCerts
	}

	platformCerts, err := secrets.GetSecretByKey(dc, "iot_platform_cert")
	if err != nil {
		return fmt.Errorf("error getting nats secrets: %v", err)
	}
	sd.Secrets["iot_platform_cert"] = *platformCerts

	platformKey, err := secrets.GetSecretByKey(dc, "iot_platform_key")
	if err != nil {
		return fmt.Errorf("error getting nats secrets: %v", err)
	}
	sd.Secrets["iot_platform_key"] = *platformKey

	sd.Secrets["nats_config"] = natsConfigSecret

	sd.Volumes = make(map[string]pt.Volume)
	volumeName := fmt.Sprintf("nats%d_data", replica)
	sd.Volumes[volumeName] = *natsVolume

	replicasValue := uint64(1)
	natsSvcResources := resources.SvcResources{
		MemoryBytes: resources.GetMemoryBytes(pd, "nats"),
		NanoCPUs:    resources.GetNanoCPU(pd, "nats"),
		ReplicasPtr: &replicasValue,
	}
	nodeRoleNumMap := resources.GetNodeRoleNumMap(pd)

	natsService := services.NatsService(
		replica,
		numNatsReplicas,
		pd,
		sd,
		natsSvcResources,
		nodeRoleNumMap,
	)

	err = CreateSwarmService(dc, natsService)
	if err != nil {
		return fmt.Errorf("error creating nats service for new replica %d: %v", replica, err)
	}

	fmt.Printf("Service nats_%d has been created successfully\n", replica)

	return nil
}

func RemoveNatsService(dc *pt.DockerClient, replica int) error {
	serviceName := fmt.Sprintf("nats%d", replica)
	service, err := InspectService(dc, serviceName)
	if err != nil {
		return fmt.Errorf("error inspecting nats service %s: %v", serviceName, err)
	}

	err = dc.Cli.ServiceRemove(dc.Ctx, service.ID)
	if err != nil {
		return fmt.Errorf("error removing nats service %s: %v", serviceName, err)
	}

	waitUntilServiceIsRemoved(serviceName)

	err = volumes.RemoveNatsVolume(dc, int(replica))
	if err != nil {
		return fmt.Errorf("error removing nats volume for removed replica %d: %v", replica, err)
	}

	return nil
}

func waitUntilServiceIsRemoved(serviceName string) {
	done := make(chan bool)
	spinnerMsg := fmt.Sprintf("Waiting for service %s to be removed", serviceName)
	endMsg := fmt.Sprintf("Service %s has been removed", serviceName)
	utils.Spinner(spinnerMsg, endMsg, done)

	time.Sleep(10 * time.Second)
	done <- true
}

func creatSecretUpdateConfig(secretKey string, certSecret pt.Secret, oldCertSecretName string, targetFile string) SecretUpdateConfig {
	return SecretUpdateConfig{
		SecretKey:     secretKey,
		SecretID:      certSecret.ID,
		NewSecretName: certSecret.Name,
		OldSecretName: oldCertSecretName,
		NewSecretData: certSecret.Data,
		TargetFile:    targetFile,
	}
}

func UpdateCertsInServices(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
) (string, error) {
	numNatsReplicas, err := GetNatsReplicas(dc)
	if err != nil {
		return "", fmt.Errorf("error getting nats replicas: %v", err)
	}

	servicesToUpdate := []string{
		"traefik",
	}
	for i := 1; i <= int(numNatsReplicas); i++ {
		natsServiceName := fmt.Sprintf("nats%d", i)
		servicesToUpdate = append(servicesToUpdate, natsServiceName)
	}

	certsSecrets, err := secrets.CreateCertsSecrets(pd, dc)
	if err != nil {
		return "", fmt.Errorf("error creating certs secrets: %v", err)
	}
	secretUpdateConfigs := []SecretUpdateConfig{}
	for secretKey, certSecret := range certsSecrets {
		oldCertSecret, err := secrets.GetSecretByKey(dc, secretKey)
		if err != nil {
			return "", fmt.Errorf("error getting old cert secret %s: %v", secretKey, err)
		}

		err = secrets.CreateSecretByName(dc, &certSecret)
		if err != nil {
			return "", fmt.Errorf("error creating new cert secret %s in docker: %v", secretKey, err)
		}

		secretUpdateConfig := creatSecretUpdateConfig(secretKey, certSecret, oldCertSecret.Name, "")
		secretUpdateConfigs = append(secretUpdateConfigs, secretUpdateConfig)
	}

	warningMessages := ""
	for _, serviceName := range servicesToUpdate {
		service, err := InspectService(dc, serviceName)
		if err != nil {
			return "", fmt.Errorf("error inspecting service %s: %v", serviceName, err)
		}

		if strings.HasPrefix(serviceName, "nats") {
			// For nats services, set the target file for the certs
			for i, secretUpdateConfig := range secretUpdateConfigs {
				switch secretUpdateConfig.SecretKey {
				case "iot_platform_cert":
					secretUpdateConfigs[i].TargetFile = "/etc/nats/cert.pem"
				case "iot_platform_key":
					secretUpdateConfigs[i].TargetFile = "/etc/nats/key.pem"
				case "iot_platform_ca_cert":
					secretUpdateConfigs[i].TargetFile = "/etc/nats/ca.pem"
				}
			}
		}

		if serviceName == "traefik" {
			// For traefik service, set the target file for the certs
			for i, secretUpdateConfig := range secretUpdateConfigs {
				switch secretUpdateConfig.SecretKey {
				case "iot_platform_cert":
					secretUpdateConfigs[i].TargetFile = "iot_platform_cert.cer"
				case "iot_platform_key":
					secretUpdateConfigs[i].TargetFile = "iot_platform.key"
				}
			}
		}

		updateOptions := ServiceUpdateOptions{
			SecretsUpdate: secretUpdateConfigs,
		}

		fmt.Printf("\nUpdating service %s with new certificates:\n", serviceName)
		warnings, err := ServiceUpdate(pd, dc, service, serviceName, updateOptions)
		if err != nil {
			return "", fmt.Errorf("error updating service %s: %v", serviceName, err)
		}
		if warnings != "" {
			warningMessages += fmt.Sprintf("Warnings for service %s:\n%s", serviceName, warnings)
		}
	}

	return warningMessages, nil
}
