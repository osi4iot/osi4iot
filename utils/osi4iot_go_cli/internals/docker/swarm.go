package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
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

func InitPlatform(pd *pt.PlatformData, excluded ...string) error {
	fmt.Println("Initializing platform...")

	pd.PlatformInfo.ExcludedServices = excluded

	deployLocation := pd.PlatformInfo.DeploymentLocation
	if deployLocation == "Local deployment" {
		localNodeData, err := utils.GetLocalNodeData()
		if err != nil {
			return fmt.Errorf("error: getting local node data: %v", err)
		}
		pd.PlatformInfo.NodesData = []pt.NodeData{localNodeData}
	}

	err1 := utils.NatsCredentials(pd)
	if err1 != nil {
		return fmt.Errorf("error: generating NATS credentials %s", err1.Error())
	}

	err := initSwarm()
	if err != nil {
		return fmt.Errorf("error: initializing swarm %s", err.Error())
	}
	dc, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error: getting docker client %s", err.Error())
	}

	err = nodesConfiguration(pd)
	if err != nil {
		return fmt.Errorf("error: configuring nodes %s", err.Error())
	}
	
	err = joinAllNodesToSwarm(dc)
	if err != nil {
		return fmt.Errorf("error: joining nodes to swarm %s", err.Error())
	}

	err = addNodesLabels(pd)
	if err != nil {
		return fmt.Errorf("error: adding labels to nodes %s", err.Error())
	}

	err = updateNodesData(dc, &pd.PlatformInfo.NodesData)
	if err != nil {
		return fmt.Errorf("error: updating nodes data %s", err.Error())
	}
	err = RunSwarm(dc, pd)
	if err != nil {
		return fmt.Errorf("error: running swarm %s", err.Error())
	}
	return nil
}

func RunSwarm(dc *pt.DockerClient, pd *pt.PlatformData) error {
	// Clean orphan network namespaces before deploying to prevent
	// "vxlan interface: file exists" errors on redeployment
	if err := cleanOrphanNetNS(dc); err != nil {
		fmt.Printf("Warning: could not clean orphan netns: %v\n", err)
		// Non-fatal: log and continue
	}

	err := createSwarmServices(pd, dc)
	if err != nil {
		return fmt.Errorf("error creating swarm services: %v", err)
	}

	return nil
}

// saveCertsFromSystemManager copies system_manager's certificate
// material into the state file, for the paths that are about to make it
// unreachable — see StopPlatform and DeletePlatform.
//
// Best-effort by design: neither stopping nor deleting a platform should
// fail because a certificate could not be read. But the warning is loud,
// because in DeletePlatform's case the consequence is silent and only
// shows up much later, at the next `init`.
func saveCertsFromSystemManager(pd *pt.PlatformData, dc *pt.DockerClient) {
	updated, source, err := SyncCertsFromSystemManager(pd, dc)
	if err != nil {
		fmt.Printf("Warning: could not read the certificates from system_manager (%v).\n"+
			"  The state file keeps the certificates it already had.\n", err)
		return
	}
	if !updated {
		return
	}
	fmt.Printf("Saving newer certificates from %s to the state file\n", source)
	if err := utils.WritePlatformDataToFile(pd); err != nil {
		fmt.Printf("Warning: could not save the updated certificates: %v\n", err)
	}
}

func createSwarmServices(platformData *pt.PlatformData, dc *pt.DockerClient) error {
	// Only "Local Garage" and "Cloud AWS S3" can be deployed.
	if err := utils.CheckS3BucketType(platformData.PlatformInfo); err != nil {
		return err
	}

	// Garage's secrets — RPC secret, admin tokens, one S3 key per
	// service — are generated at platform creation, but a state file
	// written before a consumer existed lacks its key. Fill in only what
	// is missing and save it BEFORE any secret is built from it: a key
	// handed to Garage and to a service but not written down would be
	// replaced by another one at the next deploy.
	garageChanged := utils.EnsureGarageSecrets(&platformData.PlatformInfo, false)
	if garageChanged {
		fmt.Println("Generated the missing Garage credentials")
	}
	// The Garage Web UI login follows the administrator's password: its
	// hash is regenerated only when the password changed.
	// Garage instances are normally planned, and their nodes labelled,
	// by addNodesLabels before this runs. A platform reaching this with
	// none (a `run` of a state file written before they existed) gets
	// them now, with its labels.
	if utils.IsGarage(platformData.PlatformInfo) && len(platformData.PlatformInfo.GarageInstances) == 0 {
		if err := addNodesLabels(platformData); err != nil {
			return fmt.Errorf("error placing the Garage instances: %v", err)
		}
	}

	webuiChanged, err := utils.EnsureGarageWebUIAuth(&platformData.PlatformInfo)
	if err != nil {
		return err
	}
	if garageChanged || webuiChanged {
		if err := utils.WritePlatformDataToFile(platformData); err != nil {
			return fmt.Errorf("error saving platform data: %v", err)
		}
	}

	// Before building any secret from the local state file, pick up
	// whatever certificate system_manager holds — it renews on its own
	// schedule, so the copy in osi4iot_state.json goes stale on its own.
	//
	// This matters for `run` after a `stop`: the services are gone (so
	// there is no NATS to ask) but the volumes survive, so a platform
	// restarted weeks later would otherwise be handed the certificate
	// from whenever the CLI last looked, possibly already expired, while
	// the valid one sits right there in system_manager's volume. Nothing
	// downstream would catch it: the renewer reads the volume, sees
	// weeks left, and correctly skips.
	//
	// For `create` and for `init` after a `delete` there is nothing to
	// read — `delete` removes the volumes — and this is a no-op. Those
	// two flows are covered from the other end instead: the state file
	// is the only surviving copy, and it reaches the new volume through
	// the system_manager_certs seed secret (see
	// secrets.CreateSystemManagerCertsSecret). Which is why StopPlatform
	// and DeletePlatform sync FIRST, while the volume still exists.
	//
	// See docker.SyncCertsFromSystemManager.
	if updated, source, err := SyncCertsFromSystemManager(platformData, dc); err != nil {
		return fmt.Errorf("error syncing domain certificates: %v", err)
	} else if updated {
		fmt.Printf("Domain certificates updated from %s (they were newer than the local ones)\n", source)
		if err := utils.WritePlatformDataToFile(platformData); err != nil {
			return fmt.Errorf("error saving platform data: %v", err)
		}
	}

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

	EnsurePlatformBucket(platformData, dc, nil)

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

// platformServicesToRemove lists the platform's services and the longest
// stop grace period among them (Docker's default, 10 s, when unset).
func platformServicesToRemove(dc *pt.DockerClient) (map[string]bool, time.Duration, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{Filters: filterArgs})
	if err != nil {
		return nil, 0, fmt.Errorf("error listing services: %v", err)
	}
	names := make(map[string]bool, len(services))
	maxGrace := 10 * time.Second
	for _, svc := range services {
		names[svc.Spec.Name] = true
		if spec := svc.Spec.TaskTemplate.ContainerSpec; spec != nil && spec.StopGracePeriod != nil &&
			*spec.StopGracePeriod > maxGrace {
			maxGrace = *spec.StopGracePeriod
		}
	}
	return names, maxGrace, nil
}

// waitUntilPlatformContainersAreGone waits until no node holds a
// container of the removed services — running, stopping, or stopped and
// not yet removed by Swarm, all of which keep their volumes in use.
//
// Every reachable node is asked, not just the manager. When the time is
// up, containers that are no longer running are removed here (their
// services are gone; nothing will ever start them again); one still
// running is an error, named.
func waitUntilPlatformContainersAreGone(services map[string]bool, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		type leftover struct {
			dc      *pt.DockerClient
			id      string
			name    string
			running bool
		}
		var remaining []leftover
		for ip, nodeDC := range pt.DCMap {
			if nodeDC == nil || nodeDC.Cli == nil {
				continue // unreachable: nothing it holds can be waited for
			}
			list, err := nodeDC.Cli.ContainerList(nodeDC.Ctx, container.ListOptions{All: true})
			if err != nil {
				return fmt.Errorf("error listing containers on %s: %v", ip, err)
			}
			for _, c := range list {
				if !services[c.Labels["com.docker.swarm.service.name"]] {
					continue
				}
				name := c.ID[:12]
				if len(c.Names) > 0 {
					name = strings.TrimPrefix(c.Names[0], "/")
				}
				remaining = append(remaining, leftover{nodeDC, c.ID, name + " on " + ip, c.State == "running"})
			}
		}
		if len(remaining) == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			var stillRunning []string
			for _, c := range remaining {
				if c.running {
					stillRunning = append(stillRunning, c.name)
					continue
				}
				_ = c.dc.Cli.ContainerRemove(c.dc.Ctx, c.id, container.RemoveOptions{Force: true, RemoveVolumes: true})
			}
			if len(stillRunning) > 0 {
				return fmt.Errorf("timeout waiting for the platform's containers to stop; still running: %s",
					strings.Join(stillRunning, ", "))
			}
			return nil
		}
		time.Sleep(2 * time.Second)
	}
}

func StopPlatform(platformData *pt.PlatformData) error {
	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	// Save whatever system_manager has renewed while it was up, before
	// taking it down. The volumes survive a stop, so this is not the
	// last chance the way it is in DeletePlatform — but it is the last
	// moment NATS is available, and doing it here means the state file
	// is already correct if the operator goes on to `delete` instead of
	// `run`.
	saveCertsFromSystemManager(platformData, docker)

	err = removeSwarmServices(docker)
	if err != nil {
		return fmt.Errorf("error removing services: %v", err)
	}

	return nil
}

func DeletePlatform(pd *pt.PlatformData) error {
	docker, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %v", err)
	}

	// LAST CHANCE to keep the certificates. This function removes the
	// volumes further down, and system_manager's volume is where the
	// current certificate and the ACME account key live — once it is
	// gone, the state file is the only copy that exists. If that copy is
	// stale (system_manager renewed at some point after the CLI last
	// looked, which is the normal case), a later `init` re-issues from
	// Let's Encrypt for a domain that already had a perfectly good
	// certificate, against a duplicate-certificate rate limit of five
	// per week — easy to exhaust across a few delete/init cycles.
	//
	// Deliberately before removeSwarmServices, so system_manager is
	// still running and the fast NATS path is available.
	saveCertsFromSystemManager(pd, docker)

	// What is about to be removed, and how long its slowest member may
	// take to stop: what the wait for the containers below is based on.
	removedServices, maxStopGrace, err := platformServicesToRemove(docker)
	if err != nil {
		return err
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

	_ = cleanOrphanNetNS(docker)
	err = networks.RemoveSwarmNetworks(docker)
	if err != nil {
		done <- false
		return fmt.Errorf("error removing networks: %v", err)
	}

	// The volumes can only go once no container uses them, on any node:
	// a removed service's containers take up to their stop grace period
	// to shut down (three minutes for NATS, ninety seconds for Patroni),
	// and those on workers are invisible to the manager.
	if err := waitUntilPlatformContainersAreGone(removedServices, maxStopGrace+2*time.Minute); err != nil {
		done <- false
		return err
	}

	timeOut := false
	for i := 0; i <= 60; i++ {
		time.Sleep(1 * time.Second) // wait for containers to stop completely
		err = volumes.RemoveSwarmVolumes(pd)
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

	if pd.PlatformInfo.UseAwsEbsVolumes {
		domainName := pd.PlatformInfo.DomainName
		if err := volumes.DeleteAndWaitForEBSVolumesToBeDeleted(context.Background(), domainName); err != nil {
			done <- false
			return fmt.Errorf("error waiting for EBS volumes to be deleted: %v", err)
		}
	}

	done <- true

	err = uninstallRexRayPlugin(pd)
	if err != nil {
		return fmt.Errorf("error uninstalling RexRay plugin: %v", err)
	}

	err = nodesLeaveSwarm()
	if err != nil {
		return fmt.Errorf("error leaving swarm: %v", err)
	}

	err = utils.WritePlatformDataToFile(pd)
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
				// nats1..N and patroni_admin1..N / patroni_metrics1..N are
				// each spread across several individually-named services,
				// so matching by prefix (like "nats") rather than exact
				// equality is what lets a single call here wait on the
				// whole family instead of one numbered node at a time.
				if strings.Contains(val, "nats") && serviceType == "nats" {
					filteredServices = append(filteredServices, service)
				} else if strings.Contains(val, "patroni_admin") && serviceType == "patroni_admin" {
					filteredServices = append(filteredServices, service)
				} else if strings.Contains(val, "patroni_metrics") && serviceType == "patroni_metrics" {
					filteredServices = append(filteredServices, service)
				} else if _, isInstance := utils.GarageInstanceIDFromService(val); isInstance && serviceType == utils.GarageServiceName {
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

// waitUntilServicesAreHealthy waits until every named service has a task
// in the running state.
//
// Swarm moves a task that has a health check to "running" only once its
// container is healthy (it stays in "starting" until then), so the task
// state alone answers "is it healthy?" — on any node. Container
// inspection would not: the manager's Docker client only sees the
// manager's own containers.
func waitUntilServicesAreHealthy(dc *pt.DockerClient, serviceNames []string, timeout time.Duration) error {
	names := strings.Join(serviceNames, ", ")
	done := make(chan bool)
	utils.Spinner(
		fmt.Sprintf("Waiting for %s to be healthy", names),
		fmt.Sprintf("%s healthy", names),
		done,
	)

	deadline := time.Now().Add(timeout)
	for {
		ready := 0
		for _, name := range serviceNames {
			taskFilters := filters.NewArgs()
			taskFilters.Add("service", name)
			taskFilters.Add("desired-state", "running")
			tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: taskFilters})
			if err != nil {
				continue // transient API error: try again next round
			}
			for _, task := range tasks {
				if task.Status.State == swarm.TaskStateRunning {
					ready++
					break
				}
			}
		}

		if ready == len(serviceNames) {
			done <- true
			return nil
		}
		if time.Now().After(deadline) {
			done <- false
			return fmt.Errorf("timeout waiting for %s to be healthy", names)
		}
		time.Sleep(2 * time.Second)
	}
}

// waitUntilContainersOfRemovedSlotsAreGone waits until all containers of the removed slots of a service are destroyed.
func waitUntilContainersOfRemovedSlotsAreGone(dc *pt.DockerClient, serviceName string, firstRemovedSlot int) error {
    deadline := time.Now().Add(2 * time.Minute)

    for {
        if time.Now().After(deadline) {
            return fmt.Errorf("timeout waiting for containers of removed slots of '%s' to be destroyed", serviceName)
        }

        filterArgs := filters.NewArgs()
        filterArgs.Add("label", fmt.Sprintf("com.docker.swarm.service.name=%s", serviceName))
        containers, err := dc.Cli.ContainerList(dc.Ctx, container.ListOptions{
            All:     true,
            Filters: filterArgs,
        })
        if err != nil {
            return fmt.Errorf("error listing containers: %v", err)
        }

        allGone := true
        for _, c := range containers {
            taskName := c.Labels["com.docker.swarm.task.name"]
            parts := strings.Split(taskName, ".")
            if len(parts) < 2 {
                continue
            }
            slot, err := strconv.Atoi(parts[1])
            if err != nil {
                continue
            }
            if slot >= firstRemovedSlot {
                allGone = false
                break
            }
        }

        if allGone {
            return nil
        }

        time.Sleep(2 * time.Second)
    }
}

func getNats1NodeIP(dc *pt.DockerClient) (string, error) {
    filterArgs := filters.NewArgs()
    filterArgs.Add("name", "nats1")
    tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: filterArgs})
    if err != nil {
        return "", fmt.Errorf("error listing nats1 tasks: %v", err)
    }
    for _, task := range tasks {
        if task.Status.State != swarm.TaskStateRunning {
            continue
        }
        node, _, err := dc.Cli.NodeInspectWithRaw(dc.Ctx, task.NodeID)
        if err != nil {
            return "", fmt.Errorf("error inspecting node for nats1: %v", err)
        }
        return node.Status.Addr, nil
    }
    return "", fmt.Errorf("no running task found for nats1")
}

// natsMonitorClient bounds each request to the NATS monitoring endpoint.
// http.Get has no timeout, so a single stalled request could keep the wait
// below blocked well past its deadline.
var natsMonitorClient = &http.Client{Timeout: 5 * time.Second}

// getMonitoringJSON fetches one NATS monitoring endpoint and decodes it.
func getMonitoringJSON(url string, v any) error {
	resp, err := natsMonitorClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: HTTP %d", url, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

// natsClusterStatus is what one NATS server reports about its cluster.
type natsClusterStatus struct {
	peers       int    // distinct servers it has routes to
	metaLeader  string // JetStream meta leader; empty while there is no quorum
	clusterSize int    // size of the JetStream meta group
}

func (s natsClusterStatus) String() string {
	leader := s.metaLeader
	if leader == "" {
		leader = "none"
	}
	return fmt.Sprintf("%d peer(s), JetStream meta leader: %s, meta group size: %d",
		s.peers, leader, s.clusterSize)
}

// readNatsClusterStatus asks one server for its routes (/routez) and its
// JetStream meta group (/jsz).
//
// Peers are counted by distinct remote_id, not by num_routes: since NATS
// 2.10 every pair of servers keeps a pool of route connections (three by
// default, plus one pinned to the system account), so num_routes reaches
// "numExpectedNodes-1" with a single peer connected.
func readNatsClusterStatus(baseURL string) (natsClusterStatus, error) {
	var routez struct {
		Routes []struct {
			RemoteID string `json:"remote_id"`
		} `json:"routes"`
	}
	if err := getMonitoringJSON(baseURL+"/routez", &routez); err != nil {
		return natsClusterStatus{}, err
	}
	peers := make(map[string]struct{}, len(routez.Routes))
	for _, route := range routez.Routes {
		if route.RemoteID != "" {
			peers[route.RemoteID] = struct{}{}
		}
	}

	var jsz struct {
		Meta *struct {
			Leader      string `json:"leader"`
			ClusterSize int    `json:"cluster_size"`
		} `json:"meta_cluster"`
	}
	if err := getMonitoringJSON(baseURL+"/jsz", &jsz); err != nil {
		return natsClusterStatus{}, err
	}

	status := natsClusterStatus{peers: len(peers)}
	if jsz.Meta != nil {
		status.metaLeader = jsz.Meta.Leader
		status.clusterSize = jsz.Meta.ClusterSize
	}
	return status, nil
}

// waitUntilNatsClusterIsFormed polls the monitoring endpoint of nats1 until
// the cluster is really up: nats1 has routes to every other member, and
// JetStream's meta group has elected a leader — which takes a quorum — and
// spans all numExpectedNodes servers.
//
// Route count alone was not enough: routes can be up while JetStream has
// no leader yet, and anything the CLI does next (restoring streams, for
// one) needs JetStream.
func waitUntilNatsClusterIsFormed(dc *pt.DockerClient, numExpectedNodes int) error {
	if numExpectedNodes <= 1 {
		return nil
	}

	nodeIP, err := getNats1NodeIP(dc)
	if err != nil {
		return fmt.Errorf("error getting nats1 node IP: %v", err)
	}
	baseURL := fmt.Sprintf("http://%s:8222", nodeIP)

	deadline := time.Now().Add(3 * time.Minute)
	done := make(chan bool)
	utils.Spinner(
		fmt.Sprintf("Waiting for NATS cluster to form (%d nodes)", numExpectedNodes),
		fmt.Sprintf("NATS cluster formed with %d nodes", numExpectedNodes),
		done,
	)

	var last natsClusterStatus
	var lastErr error
	for {
		status, err := readNatsClusterStatus(baseURL)
		if err != nil {
			lastErr = err
		} else {
			last, lastErr = status, nil
			// clusterSize is compared with >= rather than ==: on a
			// scale-down the meta group can keep listing departed
			// servers as offline peers for a while, and that must not
			// hold the wait up forever. The leader is what proves quorum.
			if status.peers >= numExpectedNodes-1 &&
				status.metaLeader != "" &&
				status.clusterSize >= numExpectedNodes {
				done <- true
				return nil
			}
		}

		if time.Now().After(deadline) {
			done <- false
			if lastErr != nil {
				return fmt.Errorf("timeout waiting for NATS cluster to form with %d nodes: last error from nats1: %v",
					numExpectedNodes, lastErr)
			}
			return fmt.Errorf("timeout waiting for NATS cluster to form with %d nodes: nats1 reports %s",
				numExpectedNodes, last)
		}

		time.Sleep(2 * time.Second)
	}
}

// waitUntilServiceTaskIsRunning waits until at least one task of the given
// service reaches the Running state. This is distinct from healthy — Running
// means the container process has started and its network aliases are
// registered in the overlay DNS, which is what we need before other services
// attempt to resolve them.
func waitUntilServiceTaskIsRunning(dc *pt.DockerClient, serviceName string) error {
    deadline := time.Now().Add(2 * time.Minute)

    for {
        if time.Now().After(deadline) {
            return fmt.Errorf("timeout waiting for service '%s' to have a running task", serviceName)
        }

        filterArgs := filters.NewArgs()
        filterArgs.Add("name", serviceName)
        filterArgs.Add("desired-state", "running")
        tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: filterArgs})
        if err != nil {
            time.Sleep(2 * time.Second)
            continue
        }

        for _, task := range tasks {
            if task.Status.State == swarm.TaskStateRunning {
                return nil
            }
        }

        time.Sleep(2 * time.Second)
    }
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