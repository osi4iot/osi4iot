package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/networks"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/secrets"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/services"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/volumes"
)

// realGarageCluster is garageCluster against a running platform.
type realGarageCluster struct {
	pd     *pt.PlatformData
	dc     *pt.DockerClient // a manager
	logger *log.Logger
}

func newRealGarageCluster(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) *realGarageCluster {
	if logger == nil {
		logger = log.New(log.Writer(), "", 0)
	}
	return &realGarageCluster{pd: pd, dc: dc, logger: logger}
}

func (r *realGarageCluster) Logf(format string, args ...any) { r.logger.Printf(format, args...) }
func (r *realGarageCluster) Sleep(d time.Duration)           { time.Sleep(d) }
func (r *realGarageCluster) Save() error                     { return utils.WritePlatformDataToFile(r.pd) }
func (r *realGarageCluster) Relabel() error                  { return addNodesLabels(r.pd) }

// Admin runs `garage json-api` inside the container of a running
// instance — Garage's CLI talks to its own node over RPC with the
// configuration the container already has, and that node proxies the
// call to whichever node must answer it. The first instance that can be
// reached is used; avoidID skips one (a node still joining, say).
func (r *realGarageCluster) Admin(endpoint string, payload any, avoidID int) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var reachErrs []string
	for _, inst := range utils.GarageInstancesSorted(r.pd.PlatformInfo) {
		if inst.ID == avoidID {
			continue
		}
		dc := pt.DCMap[inst.NodeIP]
		if dc == nil || dc.Cli == nil {
			reachErrs = append(reachErrs, fmt.Sprintf("garage_%d: node %s unreachable", inst.ID, inst.NodeIP))
			continue
		}
		containerID, err := runningServiceContainer(dc, utils.GarageInstanceServiceName(inst.ID))
		if err != nil {
			reachErrs = append(reachErrs, fmt.Sprintf("garage_%d: %v", inst.ID, err))
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		stdout, stderr, code, err := execCapture(ctx, dc.Cli, containerID,
			[]string{"garage", "json-api", endpoint, string(body)}, nil)
		cancel()
		if err != nil {
			reachErrs = append(reachErrs, fmt.Sprintf("garage_%d: %v", inst.ID, err))
			continue
		}
		if code != 0 {
			// Garage answered: the call itself failed. Another instance
			// would answer the same.
			return nil, fmt.Errorf("garage json-api %s: %s", endpoint, strings.TrimSpace(stderr))
		}
		return []byte(stdout), nil
	}
	return nil, fmt.Errorf("no Garage instance could run %s: %s", endpoint, strings.Join(reachErrs, "; "))
}

// runningServiceContainer finds the running container of a Swarm
// service's task on the node behind dc.
func runningServiceContainer(dc *pt.DockerClient, service string) (string, error) {
	f := filters.NewArgs()
	f.Add("label", "com.docker.swarm.service.name="+service)
	f.Add("status", "running")
	list, err := dc.Cli.ContainerList(dc.Ctx, container.ListOptions{Filters: f})
	if err != nil {
		return "", err
	}
	if len(list) == 0 {
		return "", fmt.Errorf("no running container")
	}
	return list[0].ID, nil
}

// CreateInstance creates what a new instance needs, in order: the
// secrets (its identity; the shared garage.toml, now listing it as a
// peer), its volumes on its node, and its service. Instances already
// running keep the garage.toml they started with — they learn about the
// new one from the cluster itself — so none of them restarts.
func (r *realGarageCluster) CreateInstance(inst pt.GarageInstance) error {
	pd, dc := r.pd, r.dc

	createdSecrets, err := secrets.CreateSwarmSecrets(pd, dc)
	if err != nil {
		return fmt.Errorf("error creating the secrets of garage_%d: %w", inst.ID, err)
	}

	sd := pt.SwarmData{
		Secrets:  createdSecrets,
		Volumes:  map[string]pt.Volume{},
		Networks: map[string]pt.Network{},
	}
	created, err := volumes.CreateGarageInstanceVolumes(pd.PlatformInfo, dc, inst.ID)
	if err != nil {
		return err
	}
	for _, v := range created {
		sd.Volumes[v.Name] = v
	}
	internalNet, err := networks.GetNetworkByName(dc, "internal_net")
	if err != nil {
		return fmt.Errorf("error getting the internal network: %w", err)
	}
	sd.Networks["internal_net"] = *internalNet

	one := uint64(1)
	res := resources.SvcResources{
		MemoryBytes: resources.GetMemoryBytes(pd, utils.GarageServiceName),
		NanoCPUs:    resources.GetNanoCPU(pd, utils.GarageServiceName),
		ReplicasPtr: &one,
	}
	// Never the primary: the cluster already has its keys and bucket.
	// Not serving clients yet: it has no keys until it is in the layout
	// and has synced (see services.GarageClientAliases).
	svc := services.GarageService(pd, sd, res, inst, false, false)
	if err := CreateSwarmService(dc, svc); err != nil {
		return fmt.Errorf("error creating %s: %w", svc.Name, err)
	}
	r.Logf("  Created %s on %s.", svc.Name, inst.NodeIP)
	return nil
}

// RemoveInstance removes an instance's service and then its volumes.
func (r *realGarageCluster) RemoveInstance(inst pt.GarageInstance) error {
	name := utils.GarageInstanceServiceName(inst.ID)
	if svc, err := utils.GetSwarmServiceByName(r.dc, name); err == nil && svc != nil {
		if err := r.dc.Cli.ServiceRemove(r.dc.Ctx, svc.ID); err != nil {
			return fmt.Errorf("error removing %s: %w", name, err)
		}
		if err := waitUntilServiceContainersAreGone(r.dc, name); err != nil {
			return err
		}
	}
	if err := volumes.RemoveGarageInstanceVolumes(r.pd, inst.ID); err != nil {
		return err
	}
	r.Logf("  Removed %s and its volumes.", name)
	return nil
}

// SetClientAlias gives an instance the "garage" alias or takes it away
// (see services.GarageClientAliases), and waits for Swarm to have
// replaced its task.
//
// Changing a service's networks redeploys its task, and that is part of
// the point: the restart also closes the HTTP connections clients keep
// open to it — admin_api reuses one for every request — so they
// reconnect, and DNS sends them to an instance that serves them.
// Idempotent: nothing happens if the alias is already as asked.
func (r *realGarageCluster) SetClientAlias(inst pt.GarageInstance, serve bool) error {
	name := utils.GarageInstanceServiceName(inst.ID)
	svc, err := utils.GetSwarmServiceByName(r.dc, name)
	if err != nil || svc == nil {
		return fmt.Errorf("error reading %s: %v", name, err)
	}
	want := services.GarageClientAliases(serve)

	spec := svc.Spec
	changed := false
	for i := range spec.TaskTemplate.Networks {
		if !sameAliases(spec.TaskTemplate.Networks[i].Aliases, want) {
			spec.TaskTemplate.Networks[i].Aliases = want
			changed = true
		}
	}
	if !changed {
		return nil
	}
	if _, err := r.dc.Cli.ServiceUpdate(r.dc.Ctx, svc.ID, svc.Version, spec, types.ServiceUpdateOptions{}); err != nil {
		return fmt.Errorf("error updating %s: %w", name, err)
	}

	// Wait for the rolling update to finish: the new task runs.
	deadline := time.Now().Add(5 * time.Minute)
	for {
		time.Sleep(3 * time.Second)
		current, _, err := r.dc.Cli.ServiceInspectWithRaw(r.dc.Ctx, svc.ID, types.ServiceInspectOptions{})
		if err == nil && current.UpdateStatus != nil {
			switch current.UpdateStatus.State {
			case swarm.UpdateStateCompleted:
				return nil
			case swarm.UpdateStatePaused, swarm.UpdateStateRollbackCompleted:
				return fmt.Errorf("the update of %s stopped: %s", name, current.UpdateStatus.Message)
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s was not redeployed within 5 minutes (docker service ps %s)", name, name)
		}
	}
}

func sameAliases(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

