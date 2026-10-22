package docker

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Stopping the platform in order
//
// Removing every service at once made the Patroni nodes take their whole
// stop grace period (90 s) and then be SIGKILLed. On shutdown PostgreSQL
// archives its last WAL (archive_command = wal-g wal-push) and waits for
// it, and the bucket it archives to — Garage — was being removed at the
// same moment: wal-g retried against a storage that was gone. A SIGKILL
// there is not only slow; it is the path that corrupts Patroni's Raft
// journal (see patroni_admin's entrypoint.sh).
//
// Stopping all the nodes of a Patroni cluster at once is a second
// problem: the leader, on shutdown, waits for its replicas to receive the
// shutdown checkpoint and tries to delete its leader key through Raft,
// while the replicas and the Raft quorum are disappearing with it.
//
// So the services go in four stages:
//
//  1. the applications (admin_api, pipelines, grafana, haproxy...);
//  2. the Patroni replicas, waiting until their containers are gone;
//  3. the Patroni leaders (asked to system_manager before anything is
//     removed), waiting until they are gone: alone, with nothing to wait
//     for, and with Garage still up for their last WAL;
//  4. the storage they and the rest rely on (garage_*, nats<N>), waiting
//     until every container of the platform is gone, so "stopped" means
//     stopped and a `run` right after finds the volumes free.
//
// When the leaders cannot be known (system_manager not answering), every
// Patroni node goes in stage 2.

// natsServiceName matches the NATS instances: nats1, nats2, nats3.
var natsServiceName = regexp.MustCompile(`^nats\d+$`)

type stopStage int

const (
	stageApplications stopStage = iota
	stageDatabaseReplicas
	stageDatabaseLeaders
	stageStorage
)

// stopStageOf is the stage of a service; leaders are the Patroni leaders'
// service names (patroni_admin2...).
func stopStageOf(serviceName string, leaders map[string]bool) stopStage {
	switch {
	case strings.HasPrefix(serviceName, "patroni_admin"),
		strings.HasPrefix(serviceName, "patroni_metrics"):
		if leaders[serviceName] {
			return stageDatabaseLeaders
		}
		return stageDatabaseReplicas
	case strings.HasPrefix(serviceName, "garage_"),
		natsServiceName.MatchString(serviceName):
		return stageStorage
	default:
		return stageApplications
	}
}

// stopGrace is a service's stop grace period (Docker's default when unset).
func stopGrace(svc swarm.Service) time.Duration {
	if spec := svc.Spec.TaskTemplate.ContainerSpec; spec != nil && spec.StopGracePeriod != nil {
		return *spec.StopGracePeriod
	}
	return 10 * time.Second
}

// patroniLeaders returns the service names of the Patroni clusters'
// current leaders, as far as system_manager knows them.
func patroniLeaders(pd *pt.PlatformData, dc *pt.DockerClient) map[string]bool {
	leaders := map[string]bool{}
	for _, family := range []patroniFamily{patroniAdminFamily, patroniMetricsFamily} {
		leader, err := queryPatroniLeader(pd, dc, family)
		if err == nil && strings.HasPrefix(leader, family.NamePrefix) {
			leaders[leader] = true
		}
	}
	return leaders
}

// removeSwarmServicesInOrder removes the platform's services stage by
// stage (see above) and returns once all their containers are gone.
func removeSwarmServicesInOrder(dc *pt.DockerClient, leaders map[string]bool) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{Filters: filterArgs})
	if err != nil {
		return fmt.Errorf("error listing services: %v", err)
	}

	stages := map[stopStage][]swarm.Service{}
	for _, svc := range services {
		st := stopStageOf(svc.Spec.Name, leaders)
		stages[st] = append(stages[st], svc)
	}

	all := map[string]bool{}
	var maxGrace time.Duration
	for _, stage := range []stopStage{stageApplications, stageDatabaseReplicas, stageDatabaseLeaders, stageStorage} {
		names := map[string]bool{}
		var stageGrace time.Duration
		for _, svc := range stages[stage] {
			if err := dc.Cli.ServiceRemove(dc.Ctx, svc.ID); err != nil {
				return fmt.Errorf("error removing service %s: %v", svc.Spec.Name, err)
			}
			names[svc.Spec.Name] = true
			all[svc.Spec.Name] = true
			if g := stopGrace(svc); g > stageGrace {
				stageGrace = g
			}
		}
		if stageGrace > maxGrace {
			maxGrace = stageGrace
		}
		// The applications stop alongside the databases: Postgres' fast
		// shutdown disconnects them anyway. The replicas are waited for
		// before the leaders go, and the leaders before the storage.
		if (stage == stageDatabaseReplicas || stage == stageDatabaseLeaders) && len(names) > 0 {
			if err := waitUntilPlatformContainersAreGone(names, stageGrace+30*time.Second); err != nil {
				return err
			}
		}
	}

	return waitUntilPlatformContainersAreGone(all, maxGrace+time.Minute)
}
