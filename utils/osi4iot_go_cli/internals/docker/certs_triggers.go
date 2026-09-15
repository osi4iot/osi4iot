package docker

import (
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file backs the certificate half of `osi4iot certs`. Like
// backup_triggers.go, everything here is a thin wrapper around
// requestSystemManager (patroni_scale.go) — same NATS request/reply
// mechanism, different subjects. The work itself happens inside
// system_manager (see its internal/certrenewer).

// certsRenewTimeout bounds a renewal request end to end. A DNS-01
// challenge waits on Route53 propagation plus Let's Encrypt's own
// validation, so minutes is normal and a short timeout would report
// failure on a renewal that is still perfectly on track.
//
// requestSystemManager retries on timeout, which is safe here even
// though ACME is expensive: system_manager serializes its tasks (see
// its internal/task.Serialize), so a retry arriving while the first
// renewal is still running waits for it and then finds a fresh
// certificate with weeks left, which it skips.
const certsRenewTimeout = 10 * time.Minute

// certsExportTimeout bounds the export request. Reading and returning a
// few KB off a local volume — a read-only lookup, so the short timeout
// used elsewhere in this package for those is right.
const certsExportTimeout = 30 * time.Second

// TriggerCertsRenewal asks system_manager to run its certificate
// renewal now, through the same system_manager.certs.renew subject its
// own daily schedule uses. system_manager both renews AND rolls the new
// secrets out to traefik/natsN, so on success there is nothing left for
// the caller to deploy — only to pull the result back into the local
// state file (see SyncCertsFromSystemManager). Blocks until
// system_manager reports the outcome.
func TriggerCertsRenewal(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	data, err := requestSystemManager(pd, dc, "system_manager.certs.renew", certsRenewTimeout, nil)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// RequestCertsExport asks system_manager for the certificate material it
// holds, through system_manager.certs.export. What comes back is the
// ciphertext exactly as stored on its volume — this CLI generated
// PlatformEncryptionKey and decrypts it locally, deriving the same
// subkey (utils.PurposeDomainCerts),
// so the domain's private key is never on the wire in the clear, not
// even inside the TLS-protected NATS connection.
func RequestCertsExport(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	data, err := requestSystemManager(pd, dc, "system_manager.certs.export", certsExportTimeout, nil)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// IsSystemManagerRunning reports whether the system_manager service has
// at least one running task.
//
// Callers use it to decide whether to delegate to system_manager over
// NATS or to fall back to doing the work locally, BEFORE issuing the
// request — rather than firing one into a stopped platform and waiting
// out the timeout to find out. That matters here specifically because
// certsRenewTimeout is minutes and requestSystemManager retries: "try
// and see" on a stopped platform would mean half an hour of silence.
//
// It answers a Docker question, not a NATS one: a running task whose
// NATS connection is broken still reports true, and the request then
// fails on its own. That split is deliberate — this is a cheap
// precondition, and the request's error handling covers the rest.
func IsSystemManagerRunning(dc *pt.DockerClient) bool {
	if dc == nil || dc.Cli == nil {
		return false
	}

	svcFilter := filters.NewArgs()
	svcFilter.Add("name", "system_manager")
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{Filters: svcFilter})
	if err != nil {
		return false
	}

	var serviceID string
	for _, s := range services {
		// Docker's name filter is a substring match — make sure this is
		// the service itself, not something that merely contains it.
		if s.Spec.Name == "system_manager" {
			serviceID = s.ID
			break
		}
	}
	if serviceID == "" {
		return false
	}

	taskFilter := filters.NewArgs()
	taskFilter.Add("service", serviceID)
	tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: taskFilter})
	if err != nil {
		return false
	}
	for _, t := range tasks {
		if t.Status.State == swarm.TaskStateRunning {
			return true
		}
	}
	return false
}