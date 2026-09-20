package docker

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/pkg/stdcopy"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// This file restores a whole Patroni cluster from its wal-g backups.
//
// It is the only backup target whose restore lives in the CLI rather
// than in system_manager, for two reasons. First, the operation is
// destructive, non-idempotent and multi-step: a partial run leaves the
// cluster down, so it wants a foreground process an operator is
// watching, not a swarm service that could be rescheduled to another
// node halfway through. Second, the CLI already orchestrates exactly
// this shape of thing for Patroni in patroni_scale.go.
//
// # It restores by letting Patroni do it
//
// Nothing here places a PGDATA by hand. The services are stopped, the
// data and Raft directories are emptied, and the services come back
// with PATRONI_BOOTSTRAP_METHOD=wal_g — so Patroni's own custom
// bootstrap runs `wal-g backup-fetch` (see patroni.yml). With an empty
// Raft DCS the nodes race for the /initialize key; the winner performs
// the fetch and the losers clone from it with pg_basebackup, which is
// Patroni's default create_replica method here. That means there is no
// "target node" to choose and no ownership or permissions to get right
// on a restored directory.
//
// # PITR and plain restore are the same procedure
//
// A cluster cannot be rewound in place, so recovering to a point in
// time destroys and rebuilds exactly as recovering the latest backup
// does. The only difference is whether recovery_target_time is set.
// Which also means a PITR rewinds the WHOLE cluster: everything
// committed after the target is gone. For recovering a few accidentally
// dropped rows, restoring to a throwaway instance and copying them out
// is the better tool — this one is for "the data is gone" and "the
// cluster must go back to time T", not for "someone deleted a table".

// restoreEnvBootstrapMethod and friends are the variables patroni.yml
// reads. Setting them is the entire mechanism: the values live only in
// the live service spec, and any later `osi4iot init`/`run` rebuilds
// that spec from PlatformData without them, so the restore bootstrap
// cannot linger across a deployment.
// patroniPGDataDir is PGDATA inside a patroni container, matching
// patroni.yml's postgresql.data_dir.
const patroniPGDataDir = "/data/patroni"

const (
	restoreEnvBootstrapMethod = "PATRONI_BOOTSTRAP_METHOD"
	restoreEnvBackup          = "PATRONI_RESTORE_BACKUP"
	restoreEnvTargetTime      = "PATRONI_RESTORE_TARGET_TIME"
)

// PatroniRestoreOptions configures a cluster restore.
type PatroniRestoreOptions struct {
	// Backup names which backup to fetch, or "LATEST".
	Backup string
	// TargetTime, when set, is the PITR target in a form PostgreSQL
	// accepts for recovery_target_time (e.g. "2026-09-08 14:30:00+00").
	TargetTime string
}

// RestorePatroniAdmin restores the patroni_admin cluster.
func RestorePatroniAdmin(pd *pt.PlatformData, dc *pt.DockerClient, opts PatroniRestoreOptions, logger *log.Logger) error {
	return restorePatroniFamily(pd, dc, patroniAdminFamily, opts, logger)
}

// RestorePatroniMetrics restores the patroni_metrics cluster.
func RestorePatroniMetrics(pd *pt.PlatformData, dc *pt.DockerClient, opts PatroniRestoreOptions, logger *log.Logger) error {
	return restorePatroniFamily(pd, dc, patroniMetricsFamily, opts, logger)
}

// restorePatroniFamily runs the whole procedure for one cluster.
func restorePatroniFamily(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	family patroniFamily,
	opts PatroniRestoreOptions,
	logger *log.Logger,
) error {
	if opts.Backup == "" {
		opts.Backup = "LATEST"
	}

	replicas, err := GetPatroniFamilyReplicas(dc, family)
	if err != nil {
		return fmt.Errorf("error counting %s nodes: %w", family.NamePrefix, err)
	}
	if replicas == 0 {
		return fmt.Errorf("no %s services are deployed. A restore rebuilds a running cluster in "+
			"place, so start the platform first with 'osi4iot run'", family.NamePrefix)
	}
	n := int(replicas)

	// ── 1. Get everything committed into the archive ──────────────
	//
	// With archive_timeout at 1800s, up to half an hour of committed
	// transactions can exist only in the primary's local pg_wal, and
	// step 3 destroys that.
	//
	// Whether this is possible at all is detected rather than asked
	// for. It used to be a --skip-flush flag, which put the operator in
	// the position of knowing which disaster they were in before the
	// tool told them — and guessing wrong in the safe-looking direction
	// silently loses data. With no primary there is nothing to flush
	// and nothing to lose by continuing; with one, flushing is always
	// right.
	switch owns, reason := liveClusterOwnsBackups(pd, dc, family); owns {
	case false:
		// Nothing worth rescuing: either there is no primary at all, or
		// there is one but it is not the cluster these backups came
		// from. The second case is the one that matters and the one a
		// "is there a primary?" check gets wrong — after the volumes
		// are lost, Patroni bootstraps a brand new empty cluster, which
		// looks perfectly healthy while holding no data and, worse,
		// cannot archive at all because its WAL segment names collide
		// with the real cluster's. Flushing it would abort the very
		// restore that fixes the situation.
		logger.Printf("Skipping the WAL flush: %s.", reason)
	default:
		logger.Printf("Flushing WAL to the archive...")
		summary, err := flushPatroniFamilyWAL(pd, dc, family)
		if err != nil {
			// This IS the cluster the backups belong to, so a failing
			// archive means real transactions are unrecoverable and the
			// newest restore point is older than it looks. Worth
			// stopping for, while the volumes still exist.
			return fmt.Errorf("there is a primary holding this cluster's data, but its WAL could "+
				"not be archived: %w\n"+
				"Restoring now would lose every transaction since archiving broke. "+
				"Fix archiving first, or stop the cluster and rerun if the data is already gone", err)
		}
		logger.Printf("  %s", summary)
	}

	// ── 2. Stop every node ────────────────────────────────────────
	//
	// Scaled down one at a time and only then waited on collectively:
	// a service update returns as soon as Docker accepts it, not when
	// the containers are gone.
	logger.Printf("Stopping %d %s node(s)...", n, family.NamePrefix)
	for i := 1; i <= n; i++ {
		if err := setPatroniNodeReplicas(pd, dc, family, i, 0); err != nil {
			return fmt.Errorf("%w\n"+
				"Some nodes may already be stopped. 'osi4iot service scale %s<N> 1' brings them "+
				"back if you want to abandon the restore", err, family.NamePrefix)
		}
	}
	if err := waitForPatroniTasksGone(dc, family, n, logger); err != nil {
		return err
	}

	// ── 3. Empty the data and Raft directories ────────────────────
	//
	// Both, on every node. PGDATA because that is what gets replaced;
	// Raft because the DCS still describes the old cluster, and Patroni
	// only runs bootstrap when it finds no cluster there.
	cleared := 0
	for i := 1; i <= n; i++ {
		logger.Printf("Clearing %s%d's data and Raft directories...", family.NamePrefix, i)
		if err := wipePatroniNodeData(pd, dc, family, i); err != nil {
			// The wording matters: "nothing was deleted" and "some
			// nodes are now empty" are very different situations to be
			// told you are in, and only the second one means the
			// cluster cannot simply be restarted as it was.
			state := "The cluster is stopped but nothing has been deleted"
			if cleared > 0 {
				state = fmt.Sprintf("The cluster is stopped and %d node(s) have already been cleared",
					cleared)
			}
			return fmt.Errorf("error clearing %s%d: %w\n%s — rerun the restore once this is resolved",
				family.NamePrefix, i, err, state)
		}
		cleared++
	}

	// ── 4. Bring them back with the restore bootstrap ─────────────
	logger.Printf("Starting the cluster with the restore bootstrap (backup: %s)...", opts.Backup)
	for i := 1; i <= n; i++ {
		if err := startPatroniNodeForRestore(pd, dc, family, i, opts); err != nil {
			return err
		}
		logger.Printf("  %s%d started", family.NamePrefix, i)
	}
	logger.Printf("All nodes started. Raft needs a majority before Patroni can bootstrap, " +
		"so a first minute of 'waiting on raft' in the node logs is expected.")

	// ── 5. Wait for a leader ──────────────────────────────────────
	logger.Printf("Waiting for a leader (the fetch and WAL replay can take a while)...")
	leader, err := waitForPatroniLeader(pd, dc, family, n, logger)
	if err != nil {
		return fmt.Errorf("%w\n"+
			"Check the node logs: a failed bootstrap leaves Patroni in state "+
			"'custom bootstrap failed' rather than starting an empty database", err)
	}

	logger.Printf("Restore complete. Leader: %s", leader)
	return nil
}

// liveClusterOwnsBackups reports whether the cluster currently running
// is the same one the backups were taken from, and why not when it
// isn't.
//
// The question matters because "is there a primary?" is not the same as
// "is there data worth rescuing?". Delete the volumes of a running
// cluster and Patroni does exactly what it should: bootstraps a new,
// empty cluster. That cluster has a primary, reports healthy, and holds
// nothing — and its WAL segment names collide with the real cluster's
// in the archive, so with WALG_PREVENT_WAL_OVERWRITE on it cannot
// archive at all. A flush against it fails, and aborting on that
// failure blocks the restore that would put the real data back.
//
// PostgreSQL's system identifier separates the two cleanly: it is
// assigned at initdb and survives a restore, so it matches for the real
// cluster and differs for a freshly bootstrapped one.
//
// Errors resolve to false. Not being able to tell should not block a
// restore — the flush is an optimization protecting the last few
// minutes, while the restore is the thing that recovers everything
// else.
func liveClusterOwnsBackups(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily) (bool, string) {
	leader, err := queryPatroniLeader(pd, dc, family)
	if err != nil || leader == "" {
		return false, "no primary is available, so there is no unarchived WAL to rescue"
	}

	liveID, err := livePatroniSystemIdentifier(leader)
	if err != nil {
		return false, fmt.Sprintf("could not read %s's system identifier (%v)", leader, err)
	}

	backups, err := listPatroniFamilyBackups(pd, dc, family)
	if err != nil || len(backups) == 0 {
		return false, "there are no backups to compare the running cluster against"
	}

	backupID := backups[0].SystemIdentifier
	if backupID == 0 {
		// An older wal-g, or a catalogue entry without the field. Fall
		// back to the previous behaviour: assume it is the same cluster
		// and let a flush failure stop the restore, which is the safer
		// side when the data might be real.
		return true, ""
	}
	if liveID != backupID {
		return false, fmt.Sprintf("the running cluster (system identifier %d) is not the one these "+
			"backups came from (%d) — it was bootstrapped empty after the data was lost",
			liveID, backupID)
	}
	return true, ""
}

// livePatroniSystemIdentifier reads the identifier straight out of the
// running node's pg_control file.
//
// Uses pg_controldata rather than a SQL query, after two failed
// attempts at the latter taught the same lesson twice. Connecting needs
// a role and this cluster has no "postgres" one — its superuser is
// named after the cluster (patroni_admin / patroni_metrics), which
// meant peer auth as the postgres OS user failed with:
//
//	FATAL: role "postgres" does not exist
//
// Chasing that would have meant plumbing the superuser's name and
// password in from PlatformData, for a value that is sitting in a file
// on disk. pg_controldata reads that file: no connection, no role, no
// password. It also answers when PostgreSQL is not accepting
// connections at all, which is a realistic state for a cluster somebody
// is about to restore.
//
// The binary is not on PATH in the patroni image — see pgBinPath.
func livePatroniSystemIdentifier(leader string) (uint64, error) {
	leaderDC, containerID, err := findServiceContainer(leader)
	if err != nil {
		return 0, err
	}

	script := pgBinPath + `pg_controldata -D ` + patroniPGDataDir +
		` | sed -n 's/^Database system identifier: *//p'`

	out, code, err := execInContainer(leaderDC, containerID, "postgres", []string{"/bin/sh", "-c", script}, nil)
	if err != nil {
		return 0, err
	}
	if code != 0 {
		return 0, fmt.Errorf("pg_controldata exited %d: %s", code, strings.TrimSpace(out))
	}

	id, err := strconv.ParseUint(strings.TrimSpace(out), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("unexpected pg_controldata output %q", strings.TrimSpace(out))
	}
	return id, nil
}

// setPatroniNodeReplicas scales one node's service, going through the
// package's own ServiceUpdate wrapper rather than the Docker API
// directly so this behaves like every other scaling path here.
func setPatroniNodeReplicas(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, replica int, count uint64) error {
	name := fmt.Sprintf("%s%d", family.NamePrefix, replica)

	svc, err := getPatroniNodeService(dc, name)
	if err != nil {
		return fmt.Errorf("error inspecting %s service: %w", name, err)
	}

	if _, err := ServiceUpdate(pd, dc, svc, name, ServiceUpdateOptions{
		Replicas: &count,
	}); err != nil {
		return fmt.Errorf("error scaling %s to %d: %w", name, count, err)
	}
	return nil
}

// startPatroniNodeForRestore scales one node back to 1 with the restore
// environment applied.
//
// RemoveEnv is passed alongside Env so a previous restore's variables
// cannot survive into this one — notably PATRONI_RESTORE_TARGET_TIME,
// where a leftover value would silently turn a "restore the latest
// backup" into a point-in-time recovery to whenever the last restore
// was aimed at.
func startPatroniNodeForRestore(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	family patroniFamily,
	replica int,
	opts PatroniRestoreOptions,
) error {
	name := fmt.Sprintf("%s%d", family.NamePrefix, replica)

	svc, err := getPatroniNodeService(dc, name)
	if err != nil {
		return fmt.Errorf("error inspecting %s service: %w", name, err)
	}

	env := map[string]string{
		restoreEnvBootstrapMethod: "wal_g",
		restoreEnvBackup:          opts.Backup,
	}
	removeEnv := []string{}
	if opts.TargetTime != "" {
		env[restoreEnvTargetTime] = opts.TargetTime
	} else {
		removeEnv = append(removeEnv, restoreEnvTargetTime)
	}

	one := uint64(1)
	if _, err := ServiceUpdate(pd, dc, svc, name, ServiceUpdateOptions{
		Replicas:  &one,
		Env:       env,
		RemoveEnv: removeEnv,
		// Returns as soon as Docker accepts the update. Waiting for
		// this node to be healthy before starting the next one
		// deadlocks: Raft needs a majority of the three, so node 1
		// cannot finish starting until nodes 2 and 3 exist, and they
		// are never started because we are still blocked here. The
		// cluster is waited for as a whole afterwards — see
		// waitForPatroniLeader.
		SkipMonitor: true,
	}); err != nil {
		return fmt.Errorf("error starting %s for restore: %w", name, err)
	}
	return nil
}

// waitForPatroniTasksGone blocks until no container of the family is
// still alive.
//
// The distinction that matters here is desired state versus ACTUAL
// state. Scaling to zero makes Docker set desired-state=shutdown on
// every task immediately, so filtering on desired-state=running — which
// is what this did at first — reports zero right away, while PostgreSQL
// is still running and still writing. The wipe then raced the shutdown,
// and whatever PostgreSQL flushed afterwards landed in a directory that
// had just been emptied. The result is a PGDATA that is neither empty
// nor valid, which Patroni reports as:
//
//	data dir for the cluster is not empty, but system ID is invalid
//
// and the node never joins, because Patroni will not clone over a
// non-empty directory and will not start from a broken one.
//
// So this looks at Status.State across all tasks, whatever their
// desired state, and waits for every one of them to have reached a
// terminal state.
func waitForPatroniTasksGone(dc *pt.DockerClient, family patroniFamily, n int, logger *log.Logger) error {
	deadline := time.Now().Add(3 * time.Minute)

	// Everything up to and including running means a container may
	// still exist and still be writing.
	alive := map[swarm.TaskState]bool{
		swarm.TaskStateNew:       true,
		swarm.TaskStatePending:   true,
		swarm.TaskStateAssigned:  true,
		swarm.TaskStateAccepted:  true,
		swarm.TaskStatePreparing: true,
		swarm.TaskStateReady:     true,
		swarm.TaskStateStarting:  true,
		swarm.TaskStateRunning:   true,
		// Shutdown is the state a task reaches once it HAS stopped, so
		// it is deliberately absent, as are failed, rejected, complete
		// and orphaned.
	}

	for {
		remaining := 0
		for i := 1; i <= n; i++ {
			name := fmt.Sprintf("%s%d", family.NamePrefix, i)

			f := filters.NewArgs()
			f.Add("service", name)
			tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: f})
			if err != nil {
				return fmt.Errorf("error listing tasks for %s: %w", name, err)
			}
			for _, t := range tasks {
				if alive[t.Status.State] {
					remaining++
				}
			}
		}
		if remaining == 0 {
			// Swarm marks a task shut down as soon as the container
			// exits, which is not quite the same as the volume being
			// released. A couple of seconds costs nothing next to what
			// it protects against.
			time.Sleep(3 * time.Second)
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out waiting for %d %s container(s) to stop",
				remaining, family.NamePrefix)
		}
		logger.Printf("  %d container(s) still running...", remaining)
		time.Sleep(3 * time.Second)
	}
}

// wipePatroniNodeData empties one node's data volume.
//
// Runs a short-lived container with the volume mounted rather than
// touching the host filesystem: the volume may be on another node and
// may use a non-local driver (rexray-ebs on AWS deployments), so the
// Docker API is the only portable way in. It uses the node's own image,
// which is guaranteed present, and removes the CONTENTS of
// /data/patroni rather than the directory itself so the ownership and
// 0700 mode entrypoint.sh sets survive.
func wipePatroniNodeData(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, replica int) error {
	name := fmt.Sprintf("%s%d", family.NamePrefix, replica)
	volumeName := name + "-data"

	image, err := patroniNodeImage(pd, dc, name)
	if err != nil {
		return err
	}

	// Checked before mounting, because mount.TypeVolume with a Source
	// that does not exist does not fail: Docker creates an empty volume
	// there and then. The cleanup would run against that empty volume,
	// the node's real PGDATA would survive, and Patroni would find a
	// cluster where it was meant to find nothing — so the restore would
	// report success and leave the old data in place.
	if _, err := dc.Cli.VolumeInspect(dc.Ctx, volumeName); err != nil {
		return fmt.Errorf("the volume '%s' does not exist on this node: %w\n"+
			"Its data lives somewhere this restore cannot see, and wiping a volume "+
			"Docker would create here instead would silently leave the old data in place",
			volumeName, err)
	}

	// find -mindepth 1 -delete empties the directory without removing
	// it, so its ownership and mode survive. A PGDATA that is not there
	// at all already satisfies what this step is for — the entrypoint
	// recreates it with mkdir -p on the next start — so it is not an
	// error; neither is a raft directory a deployment has never made.
	script := "set -e; " +
		"if [ -d /data/patroni ]; then find /data/patroni -mindepth 1 -delete; fi; " +
		"rm -rf /data/raft/* 2>/dev/null || true; " +
		"echo cleared"

	created, err := dc.Cli.ContainerCreate(dc.Ctx,
		&container.Config{
			Image: image,
			// Runs as root: PGDATA is owned by postgres with mode 0700,
			// and the image's default user may not be able to empty it.
			User:       "0:0",
			Entrypoint: []string{"/bin/sh", "-c"},
			Cmd:        []string{script},
		},
		&container.HostConfig{
			Mounts: []mount.Mount{{
				Type:   mount.TypeVolume,
				Source: volumeName,
				Target: "/data",
			}},
			AutoRemove: false,
		}, nil, nil, "")
	if err != nil {
		return fmt.Errorf("error creating the cleanup container: %w", err)
	}
	defer func() {
		_ = dc.Cli.ContainerRemove(dc.Ctx, created.ID, container.RemoveOptions{Force: true})
	}()

	if err := dc.Cli.ContainerStart(dc.Ctx, created.ID, container.StartOptions{}); err != nil {
		return fmt.Errorf("error starting the cleanup container: %w", err)
	}

	statusCh, errCh := dc.Cli.ContainerWait(dc.Ctx, created.ID, container.WaitConditionNotRunning)
	select {
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("error waiting for the cleanup container: %w", err)
		}
	case status := <-statusCh:
		if status.StatusCode != 0 {
			return fmt.Errorf("the cleanup container exited with code %d: %s",
				status.StatusCode, containerTail(dc, created.ID))
		}
	case <-time.After(2 * time.Minute):
		return fmt.Errorf("the cleanup container did not finish within 2 minutes")
	}
	return nil
}

// getPatroniNodeService looks up one node's service by its EXACT name.
//
// utils.GetSwarmServiceByName filters with Docker's "name" filter,
// which matches substrings, and then returns the first result. That is
// harmless for a lookup and not harmless here: everything in this file
// either scales a service to zero or empties the volume behind it, and
// resolving "patroni_admin1" to some other service would do that to the
// wrong cluster member. The exact comparison costs nothing.
func getPatroniNodeService(dc *pt.DockerClient, serviceName string) (*swarm.Service, error) {
	f := filters.NewArgs()
	f.Add("label", "app=osi4iot")
	f.Add("name", serviceName)
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{Filters: f})
	if err != nil {
		return nil, fmt.Errorf("error listing services: %w", err)
	}

	for i := range services {
		if services[i].Spec.Name == serviceName {
			return &services[i], nil
		}
	}
	return nil, fmt.Errorf("service %s not found", serviceName)
}

// patroniNodeImage returns the image one node is actually running.
//
// Read from the live service spec rather than from PlatformData,
// because that is the image the volume's data was written by — an
// override, a pinned digest or a hand-edited service all show up here
// and none of them do in the defaults. Emptying a PGDATA with a
// different PostgreSQL major than the one that will read it afterwards
// is not a mistake worth risking to save an API call.
//
// utils.GetServiceImage is the fallback, and note the name: its entries
// are per node ("patroni_admin1"), not per family, which is why passing
// the family prefix found nothing.
func patroniNodeImage(pd *pt.PlatformData, dc *pt.DockerClient, serviceName string) (string, error) {
	svc, err := getPatroniNodeService(dc, serviceName)
	if err == nil && svc.Spec.TaskTemplate.ContainerSpec != nil {
		if image := svc.Spec.TaskTemplate.ContainerSpec.Image; image != "" {
			return image, nil
		}
	}

	if image := utils.GetServiceImage(pd, serviceName, ""); image != "" {
		return image, nil
	}
	return "", fmt.Errorf("could not determine the image %s is running", serviceName)
}

// containerTail returns a container's last lines, for error messages
// and progress reporting.
//
// Demultiplexes with stdcopy, which is not optional: a container
// without a TTY has its stdout and stderr interleaved on one stream in
// 8-byte-framed chunks. Reading that stream raw produces exactly the
// mess this first shipped with —
//
//	YINFO: 2026/09/12 04:37:07.673298 Backup to fetch will be...
//	KINFO: 2026/09/12 04:37:08.821634 Finished extraction of...
//
// where the leading junk is a frame header and the line boundaries are
// wherever the read happened to land.
func containerTail(dc *pt.DockerClient, id string) string {
	rc, err := dc.Cli.ContainerLogs(dc.Ctx, id, container.LogsOptions{
		ShowStdout: true, ShowStderr: true, Tail: "20",
	})
	if err != nil {
		return ""
	}
	defer rc.Close()

	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, io.LimitReader(rc, 64<<10)); err != nil {
		return ""
	}

	combined := strings.TrimSpace(stdout.String() + "\n" + stderr.String())
	return strings.TrimSpace(combined)
}

// waitForPatroniLeader polls until the cluster reports a leader.
//
// The wait is long because it covers the whole recovery: fetching the
// base backup out of S3, replaying WAL up to the target, and then each
// replica cloning from the new primary.
func waitForPatroniLeader(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, n int, logger *log.Logger) (string, error) {
	deadline := time.Now().Add(30 * time.Minute)

	var lastErr error
	for {
		leader, err := queryPatroniLeader(pd, dc, family)
		if err == nil && leader != "" {
			return leader, nil
		}
		lastErr = err

		// With the per-service progress bars skipped, a node that never
		// comes up would otherwise be invisible until the 30-minute
		// deadline. A repeatedly failing task is the shape a failed
		// custom bootstrap takes, so it is worth reporting straight
		// away rather than after half an hour of "still recovering".
		if failures := patroniTaskFailures(dc, family, n); failures != "" {
			return "", fmt.Errorf("a node is failing to start:\n%s", failures)
		}

		if time.Now().After(deadline) {
			if lastErr != nil {
				return "", fmt.Errorf("no leader after 30 minutes: %w", lastErr)
			}
			return "", fmt.Errorf("no leader after 30 minutes")
		}
		logger.Printf("  still recovering...")
		time.Sleep(15 * time.Second)
	}
}

// patroniTaskFailures describes any node whose task keeps dying, or ""
// when everything is merely slow.
//
// It only reports a node after several attempts: one failed task during
// a restore is normal, since the nodes come up before Raft has a
// majority and Patroni exits rather than waiting forever.
func patroniTaskFailures(dc *pt.DockerClient, family patroniFamily, n int) string {
	const attemptsBeforeReporting = 3

	var report []string
	for i := 1; i <= n; i++ {
		name := fmt.Sprintf("%s%d", family.NamePrefix, i)

		f := filters.NewArgs()
		f.Add("service", name)
		f.Add("desired-state", "shutdown")
		tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: f})
		if err != nil {
			continue
		}

		failed := 0
		var lastMessage string
		for _, t := range tasks {
			if t.Status.State == swarm.TaskStateFailed || t.Status.State == swarm.TaskStateRejected {
				failed++
				if t.Status.Err != "" {
					lastMessage = t.Status.Err
				}
			}
		}
		if failed >= attemptsBeforeReporting {
			line := fmt.Sprintf("  %s: %d failed task(s)", name, failed)
			if lastMessage != "" {
				line += " — " + lastMessage
			}
			report = append(report, line)
		}
	}
	if len(report) == 0 {
		return ""
	}
	return strings.Join(report, "\n") + "\n  'docker service logs " + family.NamePrefix + "1' has the detail"
}

// PatroniDependents lists the running services that read from the given
// cluster, so the caller can warn about what a restore takes down with
// it.
//
// Not scaled down automatically, deliberately: a restore command should
// not take ownership of half the platform's lifecycle. The operator has
// `osi4iot service scale` and knows their deployment.
func PatroniDependents(dc *pt.DockerClient, target string) ([]string, error) {
	var candidates []string
	switch target {
	case "patroni_admin":
		// Grafana keeps its own configuration database here, so it
		// breaks as thoroughly as admin_api does.
		candidates = []string{"admin_api", "frontend", "grafana"}
	case "patroni_metrics":
		// pipelines writes telemetry continuously; a PITR that rewinds
		// the cluster while it keeps ingesting is the worst case, since
		// post-target data still queued in NATS lands on a rewound
		// timeline.
		candidates = []string{"pipelines", "grafana"}
	default:
		return nil, nil
	}

	var running []string
	for _, name := range candidates {
		f := filters.NewArgs()
		f.Add("service", name)
		f.Add("desired-state", "running")
		tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: f})
		if err != nil {
			continue // best effort: this only drives a warning
		}
		for _, t := range tasks {
			if t.Status.State == swarm.TaskStateRunning {
				running = append(running, name)
				break
			}
		}
	}
	return running, nil
}