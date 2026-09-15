package docker

import (
	"bytes"
	"fmt"
	"log"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file loads a recovered SQL file back into the live cluster —
// the second half of the accidental-deletion recovery that
// patroni_extract.go starts.
//
// It is a separate command from the extraction on purpose. Getting the
// target time right is usually a matter of a couple of attempts: you
// aim at 09:00 because that is when someone noticed, find the file has
// 412 rows instead of 40,000, and try again earlier. With extraction
// and loading welded together, every one of those attempts would write
// to production.
//
// # One transaction, or nothing
//
// The file is applied inside a single BEGIN/COMMIT with
// ON_ERROR_STOP=1. A half-applied recovery is worse than no recovery:
// it leaves the table in a state nobody planned for, and the obvious
// next move — run it again — then hits conflicts on the rows that did
// land.
//
// # Through the primary's own container
//
// Rather than exposing PostgreSQL to the CLI, psql runs inside the
// primary's own container over the unix socket, with the file piped to
// its stdin. The primary is whichever node Patroni currently says it
// is, so this keeps working across a failover between extraction and
// loading.

// ApplyToPatroniAdmin loads a recovered SQL file into patroni_admin.
// See applyToPatroniFamily.
func ApplyToPatroniAdmin(pd *pt.PlatformData, dc *pt.DockerClient, sql []byte, logger *log.Logger) error {
	return applyToPatroniFamily(pd, dc, patroniAdminFamily, sql, logger)
}

// ApplyToPatroniMetrics loads a recovered SQL file into
// patroni_metrics. See applyToPatroniFamily.
func ApplyToPatroniMetrics(pd *pt.PlatformData, dc *pt.DockerClient, sql []byte, logger *log.Logger) error {
	return applyToPatroniFamily(pd, dc, patroniMetricsFamily, sql, logger)
}

func applyToPatroniFamily(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	family patroniFamily,
	sql []byte,
	logger *log.Logger,
) error {
	if len(bytes.TrimSpace(sql)) == 0 {
		return fmt.Errorf("the file is empty, there is nothing to apply")
	}

	leader, err := queryPatroniLeader(pd, dc, family)
	if err != nil {
		return fmt.Errorf("could not find the %s primary, which is where this has to be applied: %w",
			family.NamePrefix, err)
	}
	logger.Printf("Applying to the current primary: %s", leader)

	leaderDC, containerID, err := findServiceContainer(leader)
	if err != nil {
		return err
	}

	// The SQL goes in through psql's stdin rather than being copied to
	// a file in the container first. That was the original approach and
	// it had two problems: the copied file lands owned by root while
	// psql runs as postgres, so it cannot even be read; and recovered
	// production data would sit on the container's filesystem until a
	// deferred cleanup got round to it. Through stdin it exists only in
	// the pipe.
	//
	// --single-transaction plus ON_ERROR_STOP is the pair that makes
	// this all-or-nothing: without the second, psql carries on after a
	// failed statement and commits the rest.
	cmd := psqlCommand(pd, family, "-v ON_ERROR_STOP=1 --single-transaction")

	out, code, err := execInContainer(leaderDC, containerID, "postgres", []string{
		"/bin/sh", "-c", cmd,
	}, sql)
	if err != nil {
		return fmt.Errorf("error running psql on %s: %w", leader, err)
	}
	if code != 0 {
		return fmt.Errorf("the file was NOT applied — the transaction was rolled back and the "+
			"database is unchanged:\n%s", strings.TrimSpace(out))
	}

	if trimmed := strings.TrimSpace(out); trimmed != "" {
		logger.Printf("%s", trimmed)
	}
	logger.Printf("Applied. Replication carries it to the replicas on its own.")

	if lag, err := patroniReplicationLag(pd, family, leaderDC, containerID); err == nil && lag != "" {
		logger.Printf("Replica lag right now: %s", lag)
	}
	return nil
}

// findServiceContainer locates the running container of a service and
// the Docker client for the node it is on.
//
// Searches every node rather than assuming: patroni services are pinned
// by node label, so the primary is not necessarily on the node the CLI
// happens to be talking to.
func findServiceContainer(serviceName string) (*pt.DockerClient, string, error) {
	for nodeIP, dc := range pt.DCMap {
		if dc == nil || dc.Cli == nil {
			continue
		}

		f := filters.NewArgs()
		f.Add("label", "com.docker.swarm.service.name="+serviceName)
		f.Add("status", "running")
		containers, err := dc.Cli.ContainerList(dc.Ctx, container.ListOptions{Filters: f})
		if err != nil {
			return nil, "", fmt.Errorf("node '%s': error listing containers: %w", nodeIP, err)
		}
		if len(containers) > 0 {
			return dc, containers[0].ID, nil
		}
	}
	return nil, "", fmt.Errorf("no running container found for service %s", serviceName)
}

// patroniReplicationLag reports how far behind the replicas are, as a
// sanity check after a load. Best effort: a failure here says nothing
// about whether the data landed.
func patroniReplicationLag(pd *pt.PlatformData, family patroniFamily, dc *pt.DockerClient, containerID string) (string, error) {
	cmd := psqlCommand(pd, family,
		"-tAc \"SELECT coalesce(string_agg(application_name || ': ' || "+
			"coalesce(pg_wal_lsn_diff(sent_lsn, replay_lsn)::text, '?') || ' bytes', ', '), 'no replicas') "+
			"FROM pg_stat_replication\"")

	out, code, err := execInContainer(dc, containerID, "postgres", []string{"/bin/sh", "-c", cmd}, nil)
	if err != nil || code != 0 {
		return "", fmt.Errorf("could not read pg_stat_replication: %w", err)
	}
	return strings.TrimSpace(out), nil
}