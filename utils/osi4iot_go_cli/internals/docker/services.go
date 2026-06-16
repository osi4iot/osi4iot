package docker

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
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

type ServiceUpdateResult struct {
	Warnings     string
	OldSecretIDs []string
	OldConfigIDs []string
}

func ServiceUpdate(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	service *swarm.Service,
	serviceName string,
	options ServiceUpdateOptions,
) (ServiceUpdateResult, error) {
	result := ServiceUpdateResult{}
	serviceUpdateOptions := types.ServiceUpdateOptions{}

	isRollingUpdate := len(options.SecretsUpdate) > 0 ||
		len(options.ConfigsUpdate) > 0 ||
		options.Resources != nil ||
		options.Image != nil ||
		len(options.Env) > 0 ||
		len(options.RemoveEnv) > 0

	targetReplicas := uint64(0)
	if service.Spec.Mode.Replicated != nil && service.Spec.Mode.Replicated.Replicas != nil {
		targetReplicas = *service.Spec.Mode.Replicated.Replicas
	}
	if options.Replicas != nil {
		targetReplicas = *options.Replicas
	}

	// 1. Replicas
	if options.Replicas != nil {
		if service.Spec.Mode.Replicated == nil {
			service.Spec.Mode.Replicated = &swarm.ReplicatedService{}
		}
		service.Spec.Mode.Replicated.Replicas = options.Replicas
	}

	// 2. Secrets
	if len(options.SecretsUpdate) > 0 {
		for _, secretUpdate := range options.SecretsUpdate {
			secretFound := false
			for i, secretRef := range service.Spec.TaskTemplate.ContainerSpec.Secrets {
				if secretRef.SecretName == secretUpdate.OldSecretName {
					result.OldSecretIDs = append(result.OldSecretIDs, secretRef.SecretID)

					targetFile := secretUpdate.TargetFile
					if targetFile == "" && secretRef.File != nil {
						targetFile = secretRef.File.Name
					}

					service.Spec.TaskTemplate.ContainerSpec.Secrets[i] = &swarm.SecretReference{
						SecretID:   secretUpdate.SecretID,
						SecretName: secretUpdate.NewSecretName,
						File: &swarm.SecretReferenceFileTarget{
							Name: targetFile,
							UID:  "0",
							GID:  "0",
							Mode: 0444,
						},
					}
					secretFound = true
					break
				}
			}
			if !secretFound {
				return result, fmt.Errorf("secret '%s' not found in service '%s'", secretUpdate.OldSecretName, serviceName)
			}
		}
	}

	// 3. Configs
	if len(options.ConfigsUpdate) > 0 {
		for _, configUpdate := range options.ConfigsUpdate {
			configHash := utils.GetMD5Hash(configUpdate.NewConfigData)
			newConfigName := fmt.Sprintf("%s_%s", configUpdate.ConfigKey, configHash)
			newConfig := pt.Config{
				Name: newConfigName,
				Data: configUpdate.NewConfigData,
			}
			newConfigID, err := configs.CreateConfig(dc, &newConfig)
			if err != nil {
				return result, fmt.Errorf("error creating new config '%s': %v", newConfigName, err)
			}

			configFound := false
			for i, configRef := range service.Spec.TaskTemplate.ContainerSpec.Configs {
				if configRef.ConfigName == configUpdate.OldConfigName {
					result.OldConfigIDs = append(result.OldConfigIDs, configRef.ConfigID)

					targetFile := configUpdate.TargetFile
					if targetFile == "" && configRef.File != nil {
						targetFile = configRef.File.Name
					}

					service.Spec.TaskTemplate.ContainerSpec.Configs[i] = &swarm.ConfigReference{
						ConfigID:   newConfigID,
						ConfigName: newConfigName,
						File: &swarm.ConfigReferenceFileTarget{
							Name: targetFile,
							UID:  "0",
							GID:  "0",
							Mode: 0444,
						},
					}
					configFound = true
					break
				}
			}
			if !configFound {
				return result, fmt.Errorf("config '%s' not found in service '%s'", configUpdate.ConfigKey, serviceName)
			}
		}
	}

	// 4. Resources
	if options.Resources != nil {
		if service.Spec.TaskTemplate.Resources == nil {
			service.Spec.TaskTemplate.Resources = &swarm.ResourceRequirements{}
		}
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

	// 5. Image
	if options.Image != nil {
		service.Spec.TaskTemplate.ContainerSpec.Image = *options.Image
	}

	// 6. Env vars
	if len(options.Env) > 0 || len(options.RemoveEnv) > 0 {
		envMap := make(map[string]string)
		for _, envVar := range service.Spec.TaskTemplate.ContainerSpec.Env {
			for i := 0; i < len(envVar); i++ {
				if envVar[i] == '=' {
					envMap[envVar[:i]] = envVar[i+1:]
					break
				}
			}
		}
		for _, key := range options.RemoveEnv {
			delete(envMap, key)
		}
		for key, value := range options.Env {
			envMap[key] = value
		}
		newEnv := make([]string, 0, len(envMap))
		for key, value := range envMap {
			newEnv = append(newEnv, fmt.Sprintf("%s=%s", key, value))
		}
		service.Spec.TaskTemplate.ContainerSpec.Env = newEnv
	}

	// 7. Apply the update in Docker
	response, err := dc.Cli.ServiceUpdate(dc.Ctx, service.ID, service.Version, service.Spec, serviceUpdateOptions)
	if err != nil {
		return result, fmt.Errorf("error updating service '%s': %v", serviceName, err)
	}

	// 8. Monitor until completion — returns error if it fails or rolls back
	if isRollingUpdate {
		if err := utils.MonitorServiceRollingUpdate(dc, service.ID, targetReplicas); err != nil {
			return result, fmt.Errorf("error monitoring rolling update for service '%s': %v", serviceName, err)
		}
	} else if options.Replicas != nil {
		if err := utils.MonitorServiceScaleWithProgressBar(dc, service.ID, targetReplicas); err != nil {
			return result, fmt.Errorf("error monitoring scale for service '%s': %v", serviceName, err)
		}
	}

	// 9. API warnings
	for _, warning := range response.Warnings {
		result.Warnings += fmt.Sprintf("  - %s\n", warning)
	}

	// 10. Update platform data if replicas changed
	if options.Replicas != nil {
		svcIdx, svcData, err := utils.FindServiceDataByName(pd, serviceName)
		if err != nil {
			return result, fmt.Errorf("error finding service data: %v", err)
		}
		svcData.Replicas = int(*options.Replicas)
		pd.PlatformInfo.ServicesData[svcIdx] = *svcData
		if err := utils.WritePlatformDataToFile(pd); err != nil {
			return result, fmt.Errorf("error writing platform data to file: %v", err)
		}
	}

	// OldSecretIDs and OldConfigIDs are returned to the caller so they can be removed
	// once ALL services have completed their rolling update.
	return result, nil
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
	service, err := utils.GetSwarmServiceByName(dc, serviceName)
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
	updateResult, err := ServiceUpdate(pd, dc, service, serviceName, updateOptions)
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
	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return "", fmt.Errorf("error writing platform data to file: %v", err)
	}

	return updateResult.Warnings, nil
}

func UpdateSwarmServiceImage(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	serviceName string,
	image string,
) (string, error) {
	service, err := utils.GetSwarmServiceByName(dc, serviceName)
	if err != nil {
		return "", fmt.Errorf("error inspecting service: %v", err)
	}

	updateOptions := ServiceUpdateOptions{
		Image: &image,
	}
	updateResult, err := ServiceUpdate(pd, dc, service, serviceName, updateOptions)
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

	return updateResult.Warnings, nil
}

func ScaleSwarmService(pd *pt.PlatformData, dc *pt.DockerClient, serviceName string, replicas uint64) (string, error) {
	var currentReplicas uint64
	var service *swarm.Service
	var err error

	if serviceName == "nats" {
		if utils.IsEven(replicas) {
			return "", fmt.Errorf("NATS service requires an odd number of replicas: (1, 3, 5, ...)")
		}
		currentReplicas, err = GetNatsReplicas(dc)
		if err != nil {
			return "", fmt.Errorf("error getting current nats replicas: %v", err)
		}
	} else {
		service, err = utils.GetSwarmServiceByName(dc, serviceName)
		if err != nil {
			return "", fmt.Errorf("error inspecting service: %v", err)
		}
		if service.Spec.Mode.Replicated == nil {
			return "", fmt.Errorf("service '%s' is in global mode and cannot be scaled", serviceName)
		}
		currentReplicas = *service.Spec.Mode.Replicated.Replicas
		if currentReplicas == replicas {
			return fmt.Sprintf("Service '%s' is already scaled to %d replicas", serviceName, replicas), nil
		}
	}

	warningMessages := ""
	var allOldSecretIDs []string

	switch serviceName {
	case "pipelines":
		warnings, err := scaleReplicatedServiceWithVolumes(
			pd, dc, service, serviceName, currentReplicas, replicas,
			volumes.CreatePipelinesVolume, volumes.RemovePipelinesVolume,
		)
		if err != nil {
			return "", err
		}
		warningMessages += warnings

	case "grafana":
		warnings, err := scaleReplicatedServiceWithVolumes(
			pd, dc, service, serviceName, currentReplicas, replicas,
			volumes.CreateGrafanaVolume, volumes.RemoveGrafanaVolume,
		)
		if err != nil {
			return "", err
		}
		warningMessages += warnings

	case "nats":
		numNodes := len(pd.PlatformInfo.NodesData)

		// Step 1: Create the new nats_config secret for the target number of replicas.
		oldNatsConfigSecret, err := secrets.GetSecretByKey(dc, "nats_config")
		if err != nil {
			return "", fmt.Errorf("error getting old nats config secret: %v", err)
		}

		natsConfigSecret := secrets.CreateNatsConfigSecret(pd, int(replicas))
		id, err := secrets.CreateSecret(dc, &natsConfigSecret)
		if err != nil {
			return "", fmt.Errorf("error creating nats_config secret: %v", err)
		}
		natsConfigSecret.ID = id

		natsSecretUpdateConfig := SecretUpdateConfig{
			SecretKey:     "nats_config",
			SecretID:      natsConfigSecret.ID,
			NewSecretName: natsConfigSecret.Name,
			OldSecretName: oldNatsConfigSecret.Name,
			NewSecretData: natsConfigSecret.Data,
			TargetFile:    "/etc/nats/nats.conf",
		}
		natsUpdateOptions := ServiceUpdateOptions{
			SecretsUpdate: []SecretUpdateConfig{natsSecretUpdateConfig},
		}

		if replicas > currentReplicas {
			// ── SCALE UP (e.g. 1 → 3) ──────────────────────────────────────────
			//
			// Correct order:
			//   1. Update nats1 (and the existing services) with the new
			//      configuration FIRST, using stop-first to prevent two instances
			//      with incompatible configurations from running simultaneously.
			//      This is critical: when nats2/nats3 start, they will attempt to
			//      connect to nats1:6222. If nats1 still has the single-replica
			//      configuration, without a cluster configuration, it will reject
			//      those connections and the cluster will never be formed.
			//   2. Create nats2, nats3, ... once nats1 is already listening on 6222.
			//   3. Wait until the NATS cluster is fully formed before updating
			//      the dependent services.

			if AreNeededNatsDependentServiceUpdates(currentReplicas, replicas) {
				fmt.Println("\nUpdating existing nats services to new configuration")
				for replica := 1; replica <= int(currentReplicas); replica++ {
					natsServiceName := fmt.Sprintf("nats%d", replica)
					fmt.Printf("\nUpdating nats service %s:", natsServiceName)

					natsSvc, err := utils.GetSwarmServiceByName(dc, natsServiceName)
					if err != nil {
						return "", fmt.Errorf("error inspecting nats service '%s': %v", natsServiceName, err)
					}

					// Always use stop-first when scaling up: the old nats1 instance
					// uses the single-replica configuration, without the
					// cluster/routes block, and must stop BEFORE the new instance,
					// which uses the N-replica configuration with cluster/routes,
					// starts. With start-first, both instances would run
					// simultaneously with incompatible configurations, and the
					// new instance would never pass the js-enabled-only=1 health check.
					natsSvc.Spec.UpdateConfig.Order = swarm.UpdateOrderStopFirst
					natsSvc.Spec.RollbackConfig.Order = swarm.UpdateOrderStopFirst

					updateResult, err := ServiceUpdate(pd, dc, natsSvc, natsServiceName, natsUpdateOptions)
					if err != nil {
						return "", fmt.Errorf("error updating nats service '%s': %v", natsServiceName, err)
					}
					warningMessages += updateResult.Warnings
					allOldSecretIDs = append(allOldSecretIDs, updateResult.OldSecretIDs...)
				}
			}

			// Create the new NATS services. At this point, nats1 already has the
			// correct configuration and is listening on :6222, allowing
			// nats2/nats3 to establish their routes when they start.
			for replica := currentReplicas + 1; replica <= replicas; replica++ {
				if err := CreateNatsService(pd, dc, int(replica), int(replicas), natsConfigSecret); err != nil {
					return "", fmt.Errorf("error creating nats service for replica %d: %v", replica, err)
				}
			}

		} else {
			// ── SCALE DOWN (e.g. 3 → 1) ────────────────────────────────────────
			//
			// Correct order:
			//   1. Remove the extra nodes (nats2, nats3, ...) and wait until their
			//      containers and volumes have been fully released.
			//   2. Update nats1 with the new configuration AFTER the peers have
			//      disappeared. Using stop-first prevents the new nats1 instance,
			//      configured for one replica, and the old nats1 instance,
			//      configured for three replicas and trying to find nonexistent
			//      peers, from running simultaneously.

			if replicas < currentReplicas {
				fmt.Println("Removing extra nats services")
				for replica := replicas + 1; replica <= currentReplicas; replica++ {
					if err := RemoveNatsService(dc, int(replica)); err != nil {
						return "", err
					}
				}
			}

			if AreNeededNatsDependentServiceUpdates(currentReplicas, replicas) {
				fmt.Println("\nUpdating existing nats services to new configuration")
				existingNatsServices := int(replicas)
				for replica := 1; replica <= existingNatsServices; replica++ {
					natsServiceName := fmt.Sprintf("nats%d", replica)
					fmt.Printf("\nUpdating nats service %s:", natsServiceName)

					natsSvc, err := utils.GetSwarmServiceByName(dc, natsServiceName)
					if err != nil {
						return "", fmt.Errorf("error inspecting nats service '%s': %v", natsServiceName, err)
					}

					// Use stop-first when scaling down: the old nats1 instance has
					// routes pointing to nats2/nats3, which have already been
					// removed. With start-first, the new and old instances would
					// run simultaneously with incompatible configurations. With
					// stop-first, the old instance stops first and the new one
					// starts cleanly with the single-replica configuration.
					natsSvc.Spec.UpdateConfig.Order = swarm.UpdateOrderStopFirst
					natsSvc.Spec.RollbackConfig.Order = swarm.UpdateOrderStopFirst

					updateResult, err := ServiceUpdate(pd, dc, natsSvc, natsServiceName, natsUpdateOptions)
					if err != nil {
						return "", fmt.Errorf("error updating nats service '%s': %v", natsServiceName, err)
					}
					warningMessages += updateResult.Warnings
					allOldSecretIDs = append(allOldSecretIDs, updateResult.OldSecretIDs...)
				}
			}
		}

		// Step 5: Wait until all NATS containers are healthy.
		// At this point, when scaling up, nats1..N are running with the new
		// configuration. When scaling down, only nats1 exists and uses the new
		// configuration.
		if err := waitUntilAllContainersAreHealthy(pd, "nats"); err != nil {
			return "", fmt.Errorf("error waiting for nats containers to be healthy: %v", err)
		}

		// Step 5b: In multi-node clusters with three or more replicas, wait until
		// the NATS cluster has established all routes and elected a JetStream
		// meta-leader before updating the dependent services. In single-node
		// deployments, the overlay network is local and convergence is immediate,
		// so this step is unnecessary.
		if numNodes > 1 && replicas >= 3 {
			if err := waitUntilNatsClusterIsFormed(dc, int(replicas)); err != nil {
				return "", fmt.Errorf("error waiting for nats cluster to form: %v", err)
			}
		}

		// Step 6: Update the services that depend on the NATS configuration
		// (admin_api and pipelines) only when the number of replicas changes
		// between standalone mode (1) and cluster mode (>=3), since this changes
		// their connection configuration, including URLs, cluster credentials,
		// and other related settings.
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

				depSvc, err := utils.GetSwarmServiceByName(dc, dependentService)
				if err != nil {
					return "", fmt.Errorf("error inspecting '%s' service: %v", dependentService, err)
				}

				oldSecret, err := secrets.GetSecretByKey(dc, secretsKeys[dependentService])
				if err != nil {
					return "", fmt.Errorf("error getting old secret for '%s': %v", dependentService, err)
				}

				newSecret, err := CreateNatsDependentServiceSecrets(pd, dc, dependentService, int(replicas))
				if err != nil {
					return "", fmt.Errorf("error creating new secret for '%s': %v", dependentService, err)
				}

				updateResult, err := ServiceUpdate(pd, dc, depSvc, dependentService, ServiceUpdateOptions{
					SecretsUpdate: []SecretUpdateConfig{{
						SecretKey:     secretsKeys[dependentService],
						SecretID:      newSecret.ID,
						NewSecretName: newSecret.Name,
						OldSecretName: oldSecret.Name,
						NewSecretData: newSecret.Data,
						TargetFile:    targetFiles[dependentService],
					}},
				})
				if err != nil {
					return "", fmt.Errorf("error updating '%s' service: %v", dependentService, err)
				}
				warningMessages += updateResult.Warnings
				allOldSecretIDs = append(allOldSecretIDs, updateResult.OldSecretIDs...)
			}
		}

	default:
		updateResult, err := ServiceUpdate(pd, dc, service, serviceName, ServiceUpdateOptions{
			Replicas: &replicas,
		})
		if err != nil {
			return "", fmt.Errorf("error scaling service '%s': %v", serviceName, err)
		}
		warningMessages += updateResult.Warnings
	}

	// Remove old secrets — all updates completed successfully
	for _, oldSecretID := range allOldSecretIDs {
		if err := dc.Cli.SecretRemove(dc.Ctx, oldSecretID); err != nil {
			warningMessages += fmt.Sprintf("  - Warning: could not remove old secret '%s': %v\n", oldSecretID, err)
		}
	}

	// Update platform data
	svcIdx, svcData, err := utils.FindServiceDataByName(pd, serviceName)
	if err != nil {
		return "", fmt.Errorf("error finding service data: %v", err)
	}
	svcData.Replicas = int(replicas)
	pd.PlatformInfo.ServicesData[svcIdx] = *svcData
	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return "", fmt.Errorf("error writing platform data to file: %v", err)
	}

	return warningMessages, nil
}

func scaleReplicatedServiceWithVolumes(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	service *swarm.Service,
	serviceName string,
	currentReplicas, replicas uint64,
	createVolume func(pt.PlatformInfo, *pt.DockerClient, int) error,
	removeVolume func(*pt.PlatformData, int) error,
) (string, error) {
	pi := pd.PlatformInfo

	for replica := currentReplicas + 1; replica <= replicas; replica++ {
		if err := createVolume(pi, dc, int(replica)); err != nil {
			return "", fmt.Errorf("error creating %s volume for replica %d: %v", serviceName, replica, err)
		}
	}

	updateResult, err := ServiceUpdate(pd, dc, service, serviceName, ServiceUpdateOptions{
		Replicas: &replicas,
	})
	if err != nil {
		return "", fmt.Errorf("error updating %s service: %v", serviceName, err)
	}

	if err := waitUntilAllContainersAreHealthy(pd, serviceName); err != nil {
		return "", fmt.Errorf("error waiting for %s containers to be healthy: %v", serviceName, err)
	}

	if replicas < currentReplicas {
		if err := waitUntilContainersOfRemovedSlotsAreGone(dc, serviceName, int(replicas)+1); err != nil {
			return "", fmt.Errorf("error waiting for removed %s containers to be destroyed: %v", serviceName, err)
		}
	}

	for replica := replicas + 1; replica <= currentReplicas; replica++ {
		fmt.Printf("Removing %s volume for removed replica %d\n", serviceName, replica)
		if err := removeVolume(pd, int(replica)); err != nil {
			return "", fmt.Errorf("error removing %s volume for replica %d: %v", serviceName, replica, err)
		}
	}

	return updateResult.Warnings, nil
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
	service, err := utils.GetSwarmServiceByName(dc, serviceName)
	if err != nil {
		return fmt.Errorf("error inspecting nats service %s: %v", serviceName, err)
	}

	err = dc.Cli.ServiceRemove(dc.Ctx, service.ID)
	if err != nil {
		return fmt.Errorf("error removing nats service %s: %v", serviceName, err)
	}

	waitUntilServiceContainersAreGone(dc, serviceName)

	err = volumes.RemoveNatsVolume(dc, int(replica))
	if err != nil {
		return fmt.Errorf("error removing nats volume for removed replica %d: %v", replica, err)
	}

	return nil
}

// waitUntilServiceContainersAreGone waits until every container belonging to
// the given (already removed) swarm service no longer exists on any node.
func waitUntilServiceContainersAreGone(dc *pt.DockerClient, serviceName string) error {
	deadline := time.Now().Add(2 * time.Minute)

	done := make(chan bool)
	spinnerMsg := fmt.Sprintf("Waiting for service %s to be removed", serviceName)
	endMsg := fmt.Sprintf("Service %s has been removed", serviceName)
	utils.Spinner(spinnerMsg, endMsg, done)

	for {
		if time.Now().After(deadline) {
			done <- false
			return fmt.Errorf("timeout waiting for containers of service '%s' to be destroyed", serviceName)
		}

		filterArgs := filters.NewArgs()
		filterArgs.Add("label", fmt.Sprintf("com.docker.swarm.service.name=%s", serviceName))
		containers, err := dc.Cli.ContainerList(dc.Ctx, container.ListOptions{
			All:     true,
			Filters: filterArgs,
		})
		if err != nil {
			done <- false
			return fmt.Errorf("error listing containers: %v", err)
		}

		if len(containers) == 0 {
			done <- true
			return nil
		}

		time.Sleep(2 * time.Second)
	}
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
	// 1. Build the list of services to update
	numNatsReplicas, err := GetNatsReplicas(dc)
	if err != nil {
		return "", fmt.Errorf("error getting nats replicas: %v", err)
	}

	servicesToUpdate := []string{"traefik"}
	for i := 1; i <= int(numNatsReplicas); i++ {
		servicesToUpdate = append(servicesToUpdate, fmt.Sprintf("nats%d", i))
	}

	// 2. File mount paths by service family and secret key
	targetFiles := map[string]map[string]string{
		"nats": {
			"iot_platform_cert": "/etc/nats/cert.pem",
			"iot_platform_key":  "/etc/nats/key.pem",
		},
		"traefik": {
			"iot_platform_cert": "iot_platform_cert.cer",
			"iot_platform_key":  "iot_platform.key",
		},
	}

	// 3. Clean up orphan secrets from previous failed runs
	// An orphan secret is one whose name contains any of the known keys but is not referenced by any active service.
	knownSecretKeys := make([]string, 0, len(targetFiles))
	for _, paths := range targetFiles {
		for key := range paths {
			knownSecretKeys = append(knownSecretKeys, key)
		}
	}
	knownSecretKeys = uniqueStrings(knownSecretKeys)

	if err := secrets.RemoveOrphanSecrets(dc, servicesToUpdate, knownSecretKeys); err != nil {
		// Not a fatal error: we warn but continue
		fmt.Printf("Warning: could not clean up orphan secrets: %v\n", err)
	}

	// ── 4. Get the current (old) secrets before creating the new ones ─────────
	//
	// Indexed by secretKey for O(1) access later.
	oldSecrets := make(map[string]pt.Secret, len(knownSecretKeys))
	for _, secretKey := range knownSecretKeys {
		oldSecret, err := secrets.GetSecretByKey(dc, secretKey)
		if err != nil {
			return "", fmt.Errorf("error getting current secret '%s': %v", secretKey, err)
		}
		oldSecrets[secretKey] = *oldSecret
	}

	// ── 5. Validate that each service references the expected secrets ─────────
	//
	// We perform this check BEFORE creating anything in Docker to avoid
	// orphan secrets if a service does not reference the expected secret.
	for _, serviceName := range servicesToUpdate {
		service, err := utils.GetSwarmServiceByName(dc, serviceName)
		if err != nil {
			return "", fmt.Errorf("error inspecting service '%s': %v", serviceName, err)
		}

		serviceFamily := resolveServiceFamily(serviceName)
		pathsForService, ok := targetFiles[serviceFamily]
		if !ok {
			return "", fmt.Errorf("no target file mapping for service family '%s'", serviceFamily)
		}

		for secretKey := range pathsForService {
			oldSecret := oldSecrets[secretKey]
			if !serviceHasSecret(service, oldSecret.Name) {
				return "", fmt.Errorf(
					"service '%s' does not reference secret '%s' — aborting before creating any new secret",
					serviceName, oldSecret.Name,
				)
			}
		}
	}

	// ── 6. Create the new secrets in Docker ────────────────────────────────
	//
	// We only reach this point if all validations passed.
	newSecrets, err := secrets.CreateCertsSecrets(pd, dc)
	if err != nil {
		return "", fmt.Errorf("error creating new cert secrets: %v", err)
	}

	// Register the IDs of the old secrets to remove them at the end.
	oldSecretIDs := make([]string, 0, len(oldSecrets))
	for _, old := range oldSecrets {
		oldSecretIDs = append(oldSecretIDs, old.ID)
	}

	// ── 7. Update each service with the new secrets ─────────────────────────
	warningMessages := ""

	for _, serviceName := range servicesToUpdate {
		service, err := utils.GetSwarmServiceByName(dc, serviceName)
		if err != nil {
			return "", fmt.Errorf("error inspecting service '%s': %v", serviceName, err)
		}

		serviceFamily := resolveServiceFamily(serviceName)
		pathsForService := targetFiles[serviceFamily]

		secretUpdateConfigs := make([]SecretUpdateConfig, 0, len(newSecrets))
		for secretKey, newSecret := range newSecrets {
			targetFile, defined := pathsForService[secretKey]
			if !defined {
				continue
			}
			oldSecret := oldSecrets[secretKey]
			secretUpdateConfigs = append(secretUpdateConfigs, creatSecretUpdateConfig(
				secretKey,
				newSecret,
				oldSecret.Name,
				targetFile,
			))
		}

		if len(secretUpdateConfigs) == 0 {
			fmt.Printf("No cert secrets to update for service '%s', skipping\n", serviceName)
			continue
		}

		fmt.Printf("\nUpdating service '%s' with new certificates:\n", serviceName)
		updateResult, err := ServiceUpdate(pd, dc, service, serviceName, ServiceUpdateOptions{
			SecretsUpdate: secretUpdateConfigs,
		})
		if err != nil {
			return "", fmt.Errorf("error updating service '%s': %v", serviceName, err)
		}
		if updateResult.Warnings != "" {
			warningMessages += fmt.Sprintf("Warnings for service '%s':\n%s\n", serviceName, updateResult.Warnings)
		}
	}

	// ── 8. Delete old secrets — all rolling updates completed ────────────────
	for _, oldSecretID := range oldSecretIDs {
		if err := dc.Cli.SecretRemove(dc.Ctx, oldSecretID); err != nil {
			warningMessages += fmt.Sprintf("  - Warning: could not remove old secret '%s': %v\n", oldSecretID, err)
		}
	}

	return warningMessages, nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// resolveServiceFamily returns the family key ("nats", "traefik", …)
// used to look up in the targetFiles map.
func resolveServiceFamily(serviceName string) string {
	if strings.HasPrefix(serviceName, "nats") {
		return "nats"
	}
	return serviceName
}

// serviceHasSecret checks if a service already references a secret by name.
func serviceHasSecret(service *swarm.Service, secretName string) bool {
	for _, ref := range service.Spec.TaskTemplate.ContainerSpec.Secrets {
		if ref.SecretName == secretName {
			return true
		}
	}
	return false
}

// uniqueStrings removes duplicates while preserving order.
func uniqueStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; !ok {
			seen[s] = struct{}{}
			out = append(out, s)
		}
	}
	return out
}
