package docker

import (
	"archive/tar"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/volume"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file recovers data that was deleted by accident, without
// touching the live cluster.
//
// It exists because the obvious tool is the wrong one. A point-in-time
// restore rewinds the WHOLE database: to get back a table dropped three
// hours ago you would discard every transaction committed since, which
// on patroni_metrics means three hours of telemetry from every device.
// The cure is routinely worse than the disease.
//
// So instead of rewinding production, this restores the backup to a
// throwaway instance at the requested moment, pulls out only what was
// asked for, and throws the instance away. The live cluster is never
// stopped, never modified and never even connected to. Loading the
// result back is a separate, explicit step — see patroni_apply.go.
//
// # The throwaway instance archives nothing
//
// It runs with archive_mode=off, and that is not a detail. Inheriting
// the cluster's archive_command would have it pushing WAL segments into
// the same wal-g prefix as the live cluster, under names that collide
// with the real ones — quietly corrupting the archive while the
// operator believes they are recovering data. It also publishes no
// port: everything happens through docker exec on a unix socket, so
// nothing can connect to it by accident.

const (
	// extractDataDir is the throwaway instance's PGDATA, inside its own
	// volume.
	//
	// Deliberately the SAME path the live cluster uses. Patroni writes
	// absolute paths into the postgresql.conf it puts in PGDATA —
	// hba_file, ident_file and friends all point at /data/patroni — and
	// those come back with the backup. Restoring to any other directory
	// leaves them dangling:
	//
	//	FATAL: could not load /data/patroni/pg_hba.conf
	//
	// Matching the path makes every one of them resolve, whatever else
	// Patroni decided to write absolutely.
	extractDataDir = patroniPGDataDir
	// extractHBAFile and extractIdentFile are written by this package
	// and live OUTSIDE PGDATA, so the extraction cannot overwrite them.
	extractHBAFile   = "/data/recovery_pg_hba.conf"
	extractIdentFile = "/data/recovery_pg_ident.conf"
	// extractOutputPath is where the dump is written inside the
	// container before being copied out.
	extractOutputPath = "/tmp/recovered.sql"
	// extractContainerName is fixed so an interrupted run leaves
	// something findable and the next attempt can clear it.
	extractContainerName = "osi4iot-recovery-extract"
	// extractVolumeName likewise.
	extractVolumeName = "osi4iot-recovery-extract-data"
)

// PatroniExtractOptions configures an extraction.
type PatroniExtractOptions struct {
	// TargetTime is the moment to recover to, in a form PostgreSQL
	// accepts for recovery_target_time. Required: without it this is
	// just a slow way to dump the current database.
	TargetTime string
	// Backup names the base backup to start from, or "" to pick the
	// newest one taken before TargetTime.
	Backup string
	// Table dumps one table with pg_dump. The simple path, and the one
	// that cannot be used wrongly.
	Table string
	// SQL is an arbitrary statement run against the throwaway
	// instance, for what Table cannot express. Its output becomes the
	// recovered file.
	SQL string
	// OutputPath is where the result is written locally.
	OutputPath string
}

// ExtractFromPatroniAdmin recovers data from the patroni_admin cluster
// as it was at a point in time. See extractFromPatroniFamily.
func ExtractFromPatroniAdmin(pd *pt.PlatformData, dc *pt.DockerClient, opts PatroniExtractOptions, logger *log.Logger) error {
	return extractFromPatroniFamily(pd, dc, patroniAdminFamily, opts, logger)
}

// ExtractFromPatroniMetrics recovers data from the patroni_metrics
// cluster as it was at a point in time. See extractFromPatroniFamily.
func ExtractFromPatroniMetrics(pd *pt.PlatformData, dc *pt.DockerClient, opts PatroniExtractOptions, logger *log.Logger) error {
	return extractFromPatroniFamily(pd, dc, patroniMetricsFamily, opts, logger)
}

func extractFromPatroniFamily(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	family patroniFamily,
	opts PatroniExtractOptions,
	logger *log.Logger,
) error {
	if opts.TargetTime == "" {
		return fmt.Errorf("--target-time is required: it is the moment to recover the data from")
	}
	if opts.Table == "" && opts.SQL == "" {
		return fmt.Errorf("nothing to extract: pass --table to dump one table, or --sql/--sql-file " +
			"for anything else")
	}
	if opts.OutputPath == "" {
		opts.OutputPath = "recovered.sql"
	}

	// Anything committed in the last few minutes may still be only in
	// the primary's local pg_wal, and the throwaway instance can only
	// replay what reached the archive. Best effort: on a cluster with
	// no primary there is nothing to flush, and the extraction is
	// still worth attempting from what IS archived.
	logger.Printf("Flushing WAL to the archive so recent transactions are recoverable...")
	if summary, err := flushPatroniFamilyWAL(pd, dc, family); err != nil {
		logger.Printf("  could not flush (%v)", err)
		logger.Printf("  continuing: anything not yet archived will be missing from the extract")
	} else {
		logger.Printf("  %s", summary)
	}

	backup := opts.Backup
	if backup == "" {
		var err error
		backup, err = pickBackupBefore(pd, dc, family, opts.TargetTime)
		if err != nil {
			return err
		}
		logger.Printf("Using base backup %s (the newest one taken before %s).", backup, opts.TargetTime)
	}

	image, err := patroniNodeImage(pd, dc, family.NamePrefix+"1")
	if err != nil {
		return err
	}

	// Everything the throwaway instance needs, passed as environment
	// rather than by mounting the swarm secret — a standalone container
	// cannot mount one, and the CLI holds the same values in its state
	// file anyway. These are exactly the variables
	// secrets.CreatePatroniSecrets writes into patroni_<family>.
	env := walgEnvFor(pd, family)

	// Whether to dump the table's definition as well as its rows is not
	// something the operator should have to work out: it depends on
	// whether the table is still there, which the live cluster can be
	// asked. Dumping data alone into a table that was DROPPED fails
	// with `relation ... does not exist`, and dumping the definition
	// into a table that still exists fails with `already exists` —
	// both loudly and harmlessly, thanks to the single transaction, but
	// both a wasted round trip.
	withSchema := false
	if opts.Table != "" {
		exists, err := liveTableExists(pd, dc, family, opts.Table)
		switch {
		case err != nil:
			logger.Printf("Could not check whether %s still exists (%v) — dumping rows only.",
				opts.Table, err)
		case !exists:
			withSchema = true
			logger.Printf("%s no longer exists in the live cluster, so its definition is "+
				"included as well as its rows.", opts.Table)
		default:
			logger.Printf("%s still exists in the live cluster, so only its rows are dumped.",
				opts.Table)
		}
	}

	logger.Printf("Restoring to a throwaway instance at %s...", opts.TargetTime)
	inst, err := startExtractInstance(dc, pd, family, image, env, backup, opts.TargetTime, logger)
	if err != nil {
		return err
	}
	defer inst.stop(dc, logger)

	logger.Printf("Extracting...")
	if err := inst.runExtraction(dc, pd, family, opts, withSchema); err != nil {
		return err
	}

	data, err := inst.copyOut(dc)
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		// Empty means different things for the two paths, and the
		// original message assumed the wrong one — it blamed the target
		// time for what was usually a query that simply had no rows to
		// return.
		if opts.SQL != "" {
			return fmt.Errorf("the query ran but returned no rows, so there is nothing to apply.\n"+
				"That is a real answer: at %s the data it asks for did not exist. Check the query "+
				"against what you expect to find, or try an earlier target time", opts.TargetTime)
		}
		return fmt.Errorf("%s had no rows at %s, so there is nothing to recover.\n"+
			"If you expected data there, the target time may be later than the deletion",
			opts.Table, opts.TargetTime)
	}

	if err := os.WriteFile(opts.OutputPath, data, 0600); err != nil {
		return fmt.Errorf("error writing %s: %w", opts.OutputPath, err)
	}

	logger.Printf("Wrote %s (%d bytes).", opts.OutputPath, len(data))
	if withSchema {
		logger.Printf("It ends with the table's foreign keys. If a referenced row is gone they " +
			"will fail and nothing is applied — delete that section and rerun the apply.")
	}
	logger.Printf("Read it before loading anything. When it looks right:")
	logger.Printf("  osi4iot backup apply %s --file %s", family.NamePrefix, opts.OutputPath)
	return nil
}

// liveTableExists reports whether a table is present in the running
// cluster, asked of the current primary.
func liveTableExists(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, table string) (bool, error) {
	leader, err := queryPatroniLeader(pd, dc, family)
	if err != nil || leader == "" {
		return false, fmt.Errorf("no primary available")
	}
	leaderDC, containerID, err := findServiceContainer(leader)
	if err != nil {
		return false, err
	}

	// to_regclass returns NULL rather than raising when the name does
	// not resolve, so this is one round trip with no error handling for
	// the expected case.
	query := fmt.Sprintf("-tAc \"SELECT to_regclass(%s) IS NOT NULL\"", shellQuote(table))
	out, code, err := execInContainer(leaderDC, containerID, "postgres",
		[]string{"/bin/sh", "-c", psqlCommand(pd, family, query)}, nil)
	if err != nil {
		return false, err
	}
	if code != 0 {
		return false, fmt.Errorf("psql exited %d: %s", code, strings.TrimSpace(out))
	}
	return strings.TrimSpace(out) == "t", nil
}

// extractInstance is the throwaway PostgreSQL.
type extractInstance struct {
	containerID string
}

// startExtractInstance fetches the backup into a fresh volume, starts
// PostgreSQL against it recovering to targetTime, and waits until it
// accepts connections.
func startExtractInstance(
	dc *pt.DockerClient,
	pd *pt.PlatformData,
	family patroniFamily,
	image string,
	env []string,
	backup, targetTime string,
	logger *log.Logger,
) (*extractInstance, error) {
	removeStaleExtractResources(dc)

	if _, err := dc.Cli.VolumeCreate(dc.Ctx, volume.CreateOptions{
		Name: extractVolumeName,
		Labels: map[string]string{
			"app":          "osi4iot",
			"osi4iot.role": "recovery",
		},
	}); err != nil {
		return nil, fmt.Errorf("error creating the throwaway volume: %w", err)
	}

	// archive_mode=off is the line that matters most here: see this
	// file's comment. recovery_target_action=promote leaves a normal
	// read-write instance, which pg_dump and psql are happy with; the
	// new timeline it creates goes nowhere, because nothing is
	// archived.
	// This script runs as root (User "0:0" below), so `su` needs no
	// password here — unlike the exec calls elsewhere, which run as the
	// image's own postgres user and set the exec user instead. -s
	// /bin/sh because the postgres account's shell may be nologin.
	// PGBIN is resolved once and then interpolated into the `su`
	// command lines, rather than exported.
	//
	// Exporting PATH before `su` does not work: su resets PATH from
	// /etc/login.defs for the target user, so the export is discarded
	// and pg_ctl — which lives only in the versioned directory, not in
	// /usr/bin — is not found. That failure exits 127 with a message
	// easy to miss:
	//
	//	sh: 1: pg_ctl: not found
	//
	// The outer shell expands $PGBIN before handing the string to su,
	// so the absolute path survives the environment reset. wal-g needs
	// no prefix: it IS on PATH.
	//
	// On failure the script prints /tmp/pg.log before exiting. pg_ctl's
	// own message is "could not start server. Examine the log output.",
	// and the log it means is that file — which, without this, was
	// thrown away with the container and left nothing to examine.
	//
	// The chown/chmod come AFTER the extraction rather than before:
	// PostgreSQL refuses to start unless PGDATA is 0700 or 0750 and
	// owned by the server user, and what wal-g unpacks carries the
	// modes recorded in the backup.
	//
	// hba_file and ident_file are pointed at files this package writes,
	// rather than relying on the ones inside the backup. Matching the
	// PGDATA path already makes the originals resolve, but only if they
	// were captured — and a start that depends on what a backup happens
	// to contain is a start that fails on the day it matters. The rules
	// are `trust`, which is safe here and nowhere else: no published
	// port, localhost only, and the whole instance is deleted minutes
	// later.
	//
	// postgresql.auto.conf is REPLACED rather than appended to. The one
	// restored with the backup was written by Patroni on a live
	// primary, and can carry settings that make no sense here — a
	// primary_conninfo pointing at a node this container cannot reach,
	// slot names that do not exist, anything ALTER SYSTEM left behind.
	// None of it matters for a throwaway instance that only has to
	// start and answer one query, and overwriting removes a whole class
	// of reasons for it not to.
	script := fmt.Sprintf(`set -e
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -1)
if [ -z "$PGBIN" ]; then echo "PostgreSQL binaries not found" >&2; exit 1; fi
rm -rf %[1]s
mkdir -p %[1]s
chown postgres:postgres %[1]s
chmod 0700 %[1]s
su -s /bin/sh postgres -c "wal-g backup-fetch %[1]s %[2]s"
cat > %[4]s <<'HBA'
local all all trust
host all all 127.0.0.1/32 trust
host all all ::1/128 trust
HBA
: > %[5]s
chown postgres:postgres %[4]s %[5]s
chmod 0600 %[4]s %[5]s
cat > %[1]s/postgresql.auto.conf <<'CONF'
archive_mode = 'off'
archive_command = '/bin/true'
restore_command = 'wal-g wal-fetch %%f %%p'
recovery_target_time = '%[3]s'
recovery_target_action = 'promote'
listen_addresses = 'localhost'
hba_file = '%[4]s'
ident_file = '%[5]s'
CONF
touch %[1]s/recovery.signal
chown -R postgres:postgres %[1]s
chmod 0700 %[1]s
if ! su -s /bin/sh postgres -c "$PGBIN/pg_ctl -D %[1]s -w -t 600 -l /tmp/pg.log start"; then
  echo "----- postgresql log -----" >&2
  cat /tmp/pg.log >&2 2>/dev/null || echo "(no log was written)" >&2
  exit 1
fi
tail -f /dev/null
`, extractDataDir, backup, targetTime, extractHBAFile, extractIdentFile)

	created, err := dc.Cli.ContainerCreate(dc.Ctx,
		&container.Config{
			Image:      image,
			User:       "0:0",
			Env:        env,
			Entrypoint: []string{"/bin/sh", "-c"},
			Cmd:        []string{script},
			Labels: map[string]string{
				"app":          "osi4iot",
				"osi4iot.role": "recovery",
			},
		},
		&container.HostConfig{
			Mounts: []mount.Mount{{
				Type:   mount.TypeVolume,
				Source: extractVolumeName,
				Target: "/data",
			}},
			// No PortBindings on purpose. The instance does listen on
			// TCP, because the pg_hba restored with the backup has only
			// `host` rules and would reject a socket connection — but
			// on localhost only, which inside a container with no
			// published port means from this container and nowhere
			// else.
		}, extractNetworkConfig(), nil, extractContainerName)
	if err != nil {
		return nil, fmt.Errorf("error creating the throwaway container: %w", err)
	}

	inst := &extractInstance{containerID: created.ID}
	if err := dc.Cli.ContainerStart(dc.Ctx, created.ID, container.StartOptions{}); err != nil {
		inst.stop(dc, logger)
		return nil, fmt.Errorf("error starting the throwaway container: %w", err)
	}

	if err := waitForExtractInstance(dc, pd, family, created.ID, logger); err != nil {
		out := containerTail(dc, created.ID)
		inst.stop(dc, logger)
		return nil, fmt.Errorf("the throwaway instance never became ready: %w\n%s", err, out)
	}
	return inst, nil
}

// extractNetworkConfig attaches the throwaway container to the
// platform's internal overlay network.
//
// Without it the container lands on the default bridge, where "minio"
// does not resolve — and with a Local Minio deployment
// AWS_ENDPOINT is http://minio:9000. wal-g then sits there retrying the
// connection with no error and no progress, which looks exactly like a
// slow restore:
//
//	INFO: Selecting the backup with name base_0000...
//	INFO: Backup to fetch will be searched in storages: [default]
//
// and nothing after it. The networks are created with Attachable: true
// (see networks.createNetwork), so a standalone container is allowed to
// join.
//
// Harmless for a Cloud AWS S3 deployment, where the endpoint is public:
// the container just also happens to be on the overlay.
func extractNetworkConfig() *network.NetworkingConfig {
	return &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			"internal_net": {},
		},
	}
}

// waitForExtractInstance polls until psql can connect.
//
// The wait is long because it covers fetching the base backup out of S3
// and replaying WAL up to the target — which for a target hours after
// the backup can be a lot of WAL.
func waitForExtractInstance(dc *pt.DockerClient, pd *pt.PlatformData, family patroniFamily, containerID string, logger *log.Logger) error {
	deadline := time.Now().Add(20 * time.Minute)
	lastReported := ""

	for {
		out, code, err := execInContainer(dc, containerID, "postgres", []string{
			"/bin/sh", "-c",
			psqlCommand(pd, family, "-tAc 'SELECT pg_is_in_recovery()'"),
		}, nil)
		if err == nil && code == 0 && strings.Contains(out, "f") {
			return nil
		}

		// A dead container is not a slow one. Without this the wait
		// reported "still recovering..." for twenty minutes at
		// something that had already exited 127 — the information was
		// one ContainerInspect away the whole time.
		if info, inspectErr := dc.Cli.ContainerInspect(dc.Ctx, containerID); inspectErr == nil &&
			!info.State.Running {
			return fmt.Errorf("the instance exited with code %d before becoming ready.\n%s",
				info.State.ExitCode, containerTail(dc, containerID))
		}

		if time.Now().After(deadline) {
			return fmt.Errorf("timed out after 20 minutes.\nLast output from the instance:\n%s",
				containerTail(dc, containerID))
		}

		// Report what the container is actually doing rather than a
		// bare "still recovering". The distinction that matters is
		// between progress and a stall — wal-g retrying an unreachable
		// endpoint prints nothing new for minutes, and without this the
		// only way to tell was `docker logs` in another terminal.
		line := lastLogLine(dc, containerID)
		if line != "" && line != lastReported {
			logger.Printf("  %s", line)
			lastReported = line
		} else {
			logger.Printf("  still recovering...")
		}
		time.Sleep(10 * time.Second)
	}
}

// lastLogLine returns the container's most recent line of output.
func lastLogLine(dc *pt.DockerClient, containerID string) string {
	tail := containerTail(dc, containerID)
	if tail == "" {
		return ""
	}
	lines := strings.Split(strings.TrimSpace(tail), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

// runExtraction produces the recovered SQL inside the container.
func (i *extractInstance) runExtraction(
	dc *pt.DockerClient,
	pd *pt.PlatformData,
	family patroniFamily,
	opts PatroniExtractOptions,
	withSchema bool,
) error {
	database := patroniDatabaseName(pd, family)

	var cmd string
	switch {
	case opts.Table != "":
		// --column-inserts rather than COPY: column-qualified INSERTs
		// survive a column having been added to the live table since
		// the backup, which a positional COPY would not.
		//
		// Whether --data-only is used depends on the live cluster; see
		// the caller. Dumping the definition too also brings the table's
		// owned sequence along with its setval, which is what keeps the
		// next INSERT from colliding on a restored id.
		mode := "--data-only "
		if withSchema {
			mode = ""
		}
		user, password := patroniSuperuser(pd, family)
		cmd = pgBinPath + fmt.Sprintf(
			"PGPASSWORD=%s pg_dump -h localhost -p 5432 -U %s -d %s "+
				"%s--column-inserts --table=%s -f %s",
			shellQuote(password), shellQuote(user), shellQuote(database),
			mode, shellQuote(opts.Table), extractOutputPath)
	default:
		// -tA: tuples only, unaligned. Without it psql writes column
		// headers, padding and a row count, and the result is a nice
		// table that `osi4iot backup apply` cannot execute. The whole
		// point of this path is producing something applicable.
		cmd = psqlCommand(pd, family,
			fmt.Sprintf("-tA -v ON_ERROR_STOP=1 -c %s > %s", shellQuote(opts.SQL), extractOutputPath))
	}

	// Recreating a table without its foreign keys restores the rows and
	// silently drops referential integrity — the table looks right and
	// nothing enforces what it points at any more. pg_dump --table
	// cannot include them, because it has no way to know the referenced
	// tables exist wherever this ends up, so they are appended here.
	//
	// Only when the definition is being dumped: if the table is still
	// live its constraints are already in place, and re-adding them
	// would just fail.
	if withSchema && opts.Table != "" {
		cmd += " && " + foreignKeyDumpCommand(pd, family, opts.Table)
	}

	out, code, err := execInContainer(dc, i.containerID, "postgres", []string{
		"/bin/sh", "-c", cmd,
	}, nil)
	if err != nil {
		return fmt.Errorf("error running the extraction: %w", err)
	}
	if code != 0 {
		return fmt.Errorf("the extraction failed:\n%s", strings.TrimSpace(out))
	}
	return nil
}

// foreignKeyDumpCommand appends the table's foreign key constraints to
// the dump, in both directions, as ALTER TABLE statements.
//
// They go at the END of the file, after the rows, which is the only
// order that works: a constraint added before its data would reject
// every row whose referent is not in place yet.
//
// pg_get_constraintdef gives back exactly what PostgreSQL would print,
// so ON DELETE / ON UPDATE clauses and deferrability come along without
// this needing to know anything about them.
func foreignKeyDumpCommand(pd *pt.PlatformData, family patroniFamily, table string) string {
	// Both directions, and the inbound ones are the reason this matters.
	//
	// DROP TABLE ... CASCADE does not remove the tables that reference
	// this one — it removes the CONSTRAINTS that live on them. So after
	// a cascade the lost foreign keys belong to the other tables, and a
	// query on conrelid alone finds nothing at all. confrelid catches
	// them.
	//
	// Both are safe to run at the end of the file: outbound keys need
	// the referenced tables' rows, which were never touched, and
	// inbound ones need this table's rows, which the dump has just
	// loaded.
	query := "SELECT 'ALTER TABLE ' || conrelid::regclass || ' ADD CONSTRAINT ' || " +
		"quote_ident(conname) || ' ' || pg_get_constraintdef(oid) || ';' " +
		"FROM pg_constraint " +
		"WHERE contype = 'f' AND (conrelid = to_regclass('" + table + "') " +
		"OR confrelid = to_regclass('" + table + "')) " +
		"ORDER BY (conrelid = to_regclass('" + table + "')) DESC, conname"

	// The marker makes the section findable: if a referenced row is
	// genuinely gone the constraint fails, the whole transaction rolls
	// back, and the operator needs to be able to delete these lines and
	// re-apply the rest.
	header := fmt.Sprintf("echo '' >> %s && echo '-- foreign keys, including those that other "+
		"tables had pointing here (delete this section if a referenced row no longer exists)' >> %s",
		extractOutputPath, extractOutputPath)

	return header + " && " + psqlCommand(pd, family,
		fmt.Sprintf("-tA -v ON_ERROR_STOP=1 -c %s >> %s", shellQuote(query), extractOutputPath))
}

// copyOut retrieves the generated file.
func (i *extractInstance) copyOut(dc *pt.DockerClient) ([]byte, error) {
	reader, _, err := dc.Cli.CopyFromContainer(dc.Ctx, i.containerID, extractOutputPath)
	if err != nil {
		return nil, fmt.Errorf("error copying the result out: %w", err)
	}
	defer reader.Close()

	tr := tar.NewReader(reader)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil, fmt.Errorf("the extraction produced no file")
		}
		if err != nil {
			return nil, fmt.Errorf("error reading the result: %w", err)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		return io.ReadAll(tr)
	}
}

// stop removes the container and its volume.
//
// Always deferred, and not optional housekeeping: the instance holds a
// full copy of the database, so leaving it behind is both wasted disk
// and an extra unguarded copy of production data.
func (i *extractInstance) stop(dc *pt.DockerClient, logger *log.Logger) {
	if i == nil || i.containerID == "" {
		return
	}
	logger.Printf("Removing the throwaway instance...")

	if err := dc.Cli.ContainerRemove(dc.Ctx, i.containerID, container.RemoveOptions{Force: true}); err != nil {
		logger.Printf("  warning: could not remove the container: %v", err)
	}
	i.containerID = ""

	if err := dc.Cli.VolumeRemove(dc.Ctx, extractVolumeName, true); err != nil {
		logger.Printf("  warning: could not remove the volume %s: %v", extractVolumeName, err)
	}
}

// removeStaleExtractResources clears whatever an interrupted run left
// behind, so a retry does not fail on a name clash — and so an old
// copy of the database does not sit around indefinitely.
func removeStaleExtractResources(dc *pt.DockerClient) {
	_ = dc.Cli.ContainerRemove(dc.Ctx, extractContainerName, container.RemoveOptions{Force: true})
	_ = dc.Cli.VolumeRemove(dc.Ctx, extractVolumeName, true)
}