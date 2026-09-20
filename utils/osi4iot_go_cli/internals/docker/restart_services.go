package docker

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/swarm"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file exists because of an ordering problem that only shows up
// when a platform is stood up from a snapshot.
//
// `init --snapshot-file` brings the whole platform up first and
// restores the databases afterwards — it has to, because admin_api
// creates and empties the bucket the seeded objects go into, and
// because Patroni's restore bootstrap lives only in the live service
// spec (see snapshot_seed.go and patroni_restore.go). So there is a
// window where these services start against EMPTY databases.
//
// For most services that is harmless: they read per request and see the
// restored rows as soon as they are there. For the ones below it is
// not. They read the database once, at startup, and keep what they
// found:
//
//   - grafana loads its organisations, users, datasources and
//     dashboards when it starts, and runs its own schema migrations
//     against whatever it finds.
//   - admin_api runs dataBaseInitialization before it listens at all,
//     so what it decided — including whether the platform still looked
//     brand new — was decided against the empty database.
//   - pipelines read their topics and sensors on start; an empty
//     database gives them nothing to process, and they go on processing
//     nothing.
//
// Restarting them after the restore is the whole fix. It is not a
// workaround for the ordering: the ordering is forced, and this is the
// step that completes it.

// dbReadingServicePrefixes matches the services that have to be
// restarted. Prefixes rather than exact names because pipelines are
// replicated per instance and grafana's service may be suffixed in some
// deployments.
var dbReadingServicePrefixes = []string{"admin_api", "grafana", "pipeline"}

// RestartDatabaseReadingServices restarts the services that read the
// database at startup, so they pick up what a restore has just put
// there.
//
// Scale to zero, wait for the tasks to go, scale back. There is no
// force-update in this CLI's ServiceUpdate and adding one would be a
// larger change than this needs; scaling is the same mechanism the
// Patroni restore already uses to cycle a service.
//
// Errors are reported but do not stop the run: the data is restored
// either way, and the remedy is one `osi4iot run` away.
func RestartDatabaseReadingServices(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) {
	services, err := ListSwarmServices(dc)
	if err != nil {
		logger.Printf("Warning: could not list the services to restart them: %v", err)
		return
	}

	var toRestart []swarm.Service
	for _, service := range services {
		if matchesDatabaseReadingService(service.Spec.Name) {
			toRestart = append(toRestart, service)
		}
	}
	if len(toRestart) == 0 {
		return
	}

	names := make([]string, len(toRestart))
	for i, service := range toRestart {
		names[i] = service.Spec.Name
	}
	logger.Printf("\nRestarting the services that read the database at startup: %s",
		strings.Join(names, ", "))
	logger.Printf("  They started against the empty databases this init created, and have been")
	logger.Printf("  holding what they read there ever since.")

	for i := range toRestart {
		service := toRestart[i]
		if err := restartService(pd, dc, &service, logger); err != nil {
			logger.Printf("Warning: could not restart %s: %v", service.Spec.Name, err)
			logger.Printf("  It is still serving what it read from the empty database. "+
				"Restart it with 'osi4iot run' before using the platform.")
		}
	}
}

// matchesDatabaseReadingService reports whether a service name is one
// of the ones that need cycling.
func matchesDatabaseReadingService(name string) bool {
	for _, prefix := range dbReadingServicePrefixes {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}

// restartService takes one service down to zero replicas and back.
func restartService(pd *pt.PlatformData, dc *pt.DockerClient, service *swarm.Service, logger *log.Logger) error {
	name := service.Spec.Name

	replicas := uint64(1)
	if service.Spec.Mode.Replicated != nil && service.Spec.Mode.Replicated.Replicas != nil {
		replicas = *service.Spec.Mode.Replicated.Replicas
	}
	if replicas == 0 {
		// Already stopped, deliberately. Starting it here would be this
		// command deciding something the operator did not ask for.
		return nil
	}

	zero := uint64(0)
	if _, err := ServiceUpdate(pd, dc, service, name, ServiceUpdateOptions{
		Replicas:    &zero,
		SkipMonitor: true,
	}); err != nil {
		return fmt.Errorf("error stopping it: %w", err)
	}

	// Docker accepts the scale before the containers are gone, and a
	// service scaled straight back up can end up with the old task
	// still shutting down beside the new one. A short settle is enough
	// here — unlike Patroni, none of these hold a lock that the next
	// start waits on.
	time.Sleep(5 * time.Second)

	// Re-read: ServiceUpdate needs the current version, and the scale
	// to zero has just changed it.
	updated, _, err := dc.Cli.ServiceInspectWithRaw(dc.Ctx, service.ID, types.ServiceInspectOptions{})
	if err != nil {
		return fmt.Errorf("error re-reading it after stopping: %w", err)
	}

	if _, err := ServiceUpdate(pd, dc, &updated, name, ServiceUpdateOptions{
		Replicas: &replicas,
	}); err != nil {
		return fmt.Errorf("error starting it again: %w", err)
	}

	logger.Printf("  %s restarted.", name)
	return nil
}
