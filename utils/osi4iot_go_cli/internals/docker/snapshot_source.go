package docker

import (
	"context"
	"fmt"
	"log"
	"os"
	"path"
	"strings"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/crypto"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/snapshot"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// This file backs `osi4iot backup snapshot`: it assembles the portable
// osi4iot_snapshot.zip that `osi4iot init --snapshot-file` consumes.
//
// The division of labour is deliberate. internals/snapshot owns the
// FORMAT and knows nothing about the platform; this file owns the
// COLLECTION and knows nothing about zip. What is left here is the part
// that needs judgement: what to flush before reading, which wal-g
// backups form a restorable set, and which WAL segments go with them.
//
// # Nothing here mutates the platform's data
//
// The one thing this does write is the state file, and only to pick up
// a certificate system_manager renewed on its own schedule (see
// SyncCertsFromSystemManager) — which is the same thing createSwarmServices
// does on every run, for the same reason. Everything else is a read.
//
// --fresh is the exception, and is off by default: it triggers real
// backups first, which on a large cluster is a wal-g backup-push that
// can run for a long time. What always happens instead is a WAL flush,
// which is cheap and is what makes the snapshot's recovery point the
// moment it was taken rather than the last archived segment.

const (
	// walgBaseBackupsDir and walgWALDir are wal-g's own layout under a
	// WALG_S3_PREFIX. The _005 suffix is wal-g's internal format
	// version, not PostgreSQL's.
	walgBaseBackupsDir = "basebackups_005"
	walgWALDir         = "wal_005"

	// walgSentinelSuffix names the object that marks a base backup
	// complete. It sits BESIDE the backup's directory rather than in
	// it, which is why the two are matched separately below.
	walgSentinelSuffix = "_backup_stop_sentinel.json"

	// walSafetyMargin is subtracted from the oldest object time of the
	// base backup when deciding which WAL to carry.
	//
	// The backup's own objects are written as it runs, so their
	// timestamps sit at or after the moment recovery has to start
	// replaying from. An hour of extra segments is a rounding error
	// next to a base backup and removes a whole class of "could not
	// find WAL segment" failures at restore time.
	walSafetyMargin = time.Hour
)

// SnapshotOptions configures one `osi4iot backup snapshot` run.
type SnapshotOptions struct {
	// Output is where the bundle is written.
	Output string
	// Targets is the resolved --include list.
	Targets []snapshot.Target
	// Fresh triggers a real backup of each included target before
	// reading, rather than carrying the newest stored one.
	Fresh bool
	// AllBackups carries every object under each wal-g prefix instead
	// of the newest restorable chain.
	AllBackups bool
	// MinioImage overrides the image the MinIO client helper runs, for
	// the MinIO case. Empty means the version this platform runs.
	MinioImage string
	// CLIVersion is recorded in the manifest.
	CLIVersion string
}

// BuildSnapshot writes the bundle described by opts.
func BuildSnapshot(pd *pt.PlatformData, dc *pt.DockerClient, opts SnapshotOptions, logger *log.Logger) error {
	ctx := context.Background()

	if crypto.IsNoEncrypt() {
		// The state file on disk is plaintext JSON under --no-encrypt,
		// and it would go into the bundle as it is. A zip carrying
		// every credential the platform has in the clear is not a
		// thing to produce as a side effect of a flag meant for
		// debugging. Same refusal as triggerStateFileBackup's.
		return fmt.Errorf("encryption is disabled (--no-encrypt): refusing to write a snapshot " +
			"whose state file would be in plain text")
	}

	wantsState := snapshot.Contains(opts.Targets, snapshot.TargetState)
	wantsObjects := len(opts.Targets) > 0 && !(len(opts.Targets) == 1 && wantsState)

	if err := prepareForSnapshot(pd, dc, opts, logger); err != nil {
		return err
	}

	// Opened before the file is created so a failure to reach the
	// bucket does not leave a half-written zip behind.
	var store *PlatformS3
	if wantsObjects {
		if pd.PlatformInfo.S3BucketType == "Cloud AWS S3" {
			// Worth saying before an hour of downloading starts. On AWS
			// the backups are already off the machine, and a platform
			// rebuilt against the SAME bucket needs nothing but the
			// state file to find them again — the objects only have to
			// travel when the bucket is being left behind too.
			logger.Printf("The backups live in the AWS bucket '%s' and will be downloaded "+
				"through this machine.", pd.PlatformInfo.S3BucketName)
			logger.Printf("  If the new platform will use that same bucket, " +
				"'--include state' is enough and costs nothing.")
		}

		var err error
		store, err = OpenPlatformS3(ctx, pd, dc, opts.MinioImage, logger)
		if err != nil {
			return err
		}
		defer store.Close()
	}

	// Written beside the destination and renamed over it at the end.
	// Running the command again is meant to replace the previous
	// snapshot, but only with a complete one: writing straight to
	// opts.Output would mean an interrupted run destroys the old
	// bundle and leaves nothing in its place.
	partial := opts.Output + ".partial"
	// snapshot.Create opens with O_EXCL, so a leftover from a run that
	// was killed before its cleanup has to go first.
	if err := os.Remove(partial); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("error removing the leftover %s: %w", partial, err)
	}

	manifest := snapshot.NewManifest(opts.CLIVersion, pd, true)
	writer, err := snapshot.Create(partial, manifest)
	if err != nil {
		return err
	}
	// Removes the .partial file unless Close has already succeeded.
	defer writer.Abort()

	if wantsState {
		if err := addStateToSnapshot(pd, writer, logger); err != nil {
			return err
		}
	}

	for _, target := range opts.Targets {
		switch {
		case target == snapshot.TargetState:
			// Handled above, before anything that can fail slowly.
		case target == snapshot.TargetNatsStreams:
			if err := addNatsStreamsToSnapshot(ctx, pd, dc, store, writer, logger); err != nil {
				return err
			}
		case target == snapshot.TargetOrgData:
			if err := addOrgDataToSnapshot(ctx, pd, store, writer, logger); err != nil {
				return err
			}
		case target == snapshot.TargetPatroniAdmin:
			if err := addPatroniToSnapshot(ctx, pd, dc, store, writer, target,
				patroniAdminFamily, opts, logger); err != nil {
				return err
			}
		case target == snapshot.TargetPatroniMetrics:
			if err := addPatroniToSnapshot(ctx, pd, dc, store, writer, target,
				patroniMetricsFamily, opts, logger); err != nil {
				return err
			}
		}
	}

	if err := writer.Close(); err != nil {
		return err
	}

	// The one moment the previous snapshot is replaced, and it is
	// atomic on every filesystem this runs on: either the old bundle is
	// there or the new one is, never a half of either.
	if err := os.Rename(partial, opts.Output); err != nil {
		return fmt.Errorf("the snapshot was written but could not be moved into place "+
			"(it is at %s): %w", partial, err)
	}

	// Nothing left to read; remove the helper container now rather than
	// at the end of the function.
	store.Close()

	logger.Printf("\nWrote %s\n", opts.Output)
	logger.Print(manifest.Describe())
	return nil
}

// prepareForSnapshot does the writes that make the snapshot worth
// taking, before any of it is read.
func prepareForSnapshot(pd *pt.PlatformData, dc *pt.DockerClient, opts SnapshotOptions, logger *log.Logger) error {
	if snapshot.Contains(opts.Targets, snapshot.TargetState) {
		// system_manager renews certificates on its own schedule, so
		// the copy in the state file goes stale by itself. A snapshot
		// carrying an expired certificate would stand the platform up
		// with one, and nothing downstream would catch it — the
		// renewer reads its volume, sees weeks left, and correctly
		// skips. See createSwarmServices, which syncs for the same
		// reason on every run.
		updated, source, err := SyncCertsFromSystemManager(pd, dc)
		if err != nil {
			logger.Printf("Warning: could not read the certificates from system_manager (%v).", err)
			logger.Printf("  The snapshot carries the certificates the state file already had.")
		} else if updated {
			logger.Printf("Domain certificates updated from %s.", source)
			if err := utils.WritePlatformDataToFile(pd); err != nil {
				return fmt.Errorf("error saving platform data: %w", err)
			}
		}
	}

	if opts.Fresh {
		for _, target := range opts.Targets {
			var (
				output string
				err    error
			)
			switch target {
			case snapshot.TargetPatroniAdmin:
				logger.Printf("Taking a fresh patroni_admin backup (this can take a while)...")
				output, err = TriggerPatroniAdminBackup(pd, dc)
			case snapshot.TargetPatroniMetrics:
				logger.Printf("Taking a fresh patroni_metrics backup (this can take a while)...")
				output, err = TriggerPatroniMetricsBackup(pd, dc)
			case snapshot.TargetNatsStreams:
				logger.Printf("Taking a fresh NATS streams backup...")
				output, err = TriggerNatsBackup(pd, dc)
			default:
				continue
			}
			if err != nil {
				return fmt.Errorf("error taking a fresh %s backup: %w", target, err)
			}
			if strings.TrimSpace(output) != "" {
				logger.Printf("  %s", strings.TrimSpace(output))
			}
		}
	}

	// Always, fresh or not: without this the snapshot's recovery point
	// is wherever the last archived segment happened to land, which on
	// a quiet cluster can be hours behind.
	for _, target := range opts.Targets {
		var (
			output string
			err    error
		)
		switch target {
		case snapshot.TargetPatroniAdmin:
			output, err = FlushPatroniAdminWAL(pd, dc)
		case snapshot.TargetPatroniMetrics:
			output, err = FlushPatroniMetricsWAL(pd, dc)
		default:
			continue
		}
		if err != nil {
			// Not fatal: the snapshot is still restorable, just to an
			// older point. Saying so beats refusing to produce one.
			logger.Printf("Warning: could not flush %s's WAL (%v).", target, err)
			logger.Printf("  The snapshot recovers only as far as the last archived segment.")
			continue
		}
		logger.Printf("Flushed %s's WAL.", target)
		if strings.TrimSpace(output) != "" {
			logger.Printf("  %s", strings.TrimSpace(output))
		}
	}

	return nil
}

// addStateToSnapshot puts the state file and the editable node overlay
// in.
//
// The file is read from disk rather than re-serialized from pd: the
// snapshot should carry the file, not something that ought to equal it.
// Same reasoning as triggerStateFileBackup's.
func addStateToSnapshot(pd *pt.PlatformData, writer *snapshot.Writer, logger *log.Logger) error {
	encoded, err := os.ReadFile(utils.GetStateFilePath())
	if err != nil {
		return fmt.Errorf("error reading the state file: %w", err)
	}
	if err := writer.AddStateFile(encoded); err != nil {
		return err
	}
	if err := writer.AddNodes(snapshot.ExtractNodes(pd)); err != nil {
		return err
	}

	writer.Manifest().EnsureTarget(snapshot.TargetState).Prefix =
		snapshot.SourcePrefix(pd, snapshot.TargetState)

	logger.Printf("Added the state file (%s) and an editable state/nodes.json.",
		humanSize(int64(len(encoded))))
	return nil
}

// addNatsStreamsToSnapshot carries the newest NATS backup run.
//
// One run, not all of them: a run is a complete set of streams at a
// moment, restoring uses exactly one, and older runs would multiply the
// bundle's size for something nobody is going to reach for during a
// migration.
func addNatsStreamsToSnapshot(
	ctx context.Context,
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	store *PlatformS3,
	writer *snapshot.Writer,
	logger *log.Logger,
) error {
	prefix := pd.PlatformInfo.NATSBackupS3Prefix
	if prefix == "" {
		return fmt.Errorf("NATS stream backups are not configured: NATS_BACKUP_S3_PREFIX is empty")
	}
	bucket, keyPrefix, err := ParseS3Prefix(prefix)
	if err != nil {
		return err
	}

	runs, err := ListNatsBackups(pd, dc)
	if err != nil {
		return fmt.Errorf("error listing the NATS backup runs: %w", err)
	}
	tm := writer.Manifest().EnsureTarget(snapshot.TargetNatsStreams)
	tm.Prefix = prefix

	if len(runs) == 0 {
		logger.Printf("No NATS stream backups stored yet; the snapshot carries none.")
		return nil
	}

	newest := runs[0]
	tm.Run = newest.Name
	tm.StreamCount = newest.Streams

	// A run holding fewer streams than its neighbours is the visible
	// signature of a backup interrupted partway through, and this is
	// the last moment anyone is looking at the list.
	for _, run := range runs[1:] {
		if run.Streams > newest.Streams {
			logger.Printf("Warning: run %s has %d stream(s) but the older run %s has %d.",
				newest.Name, newest.Streams, run.Name, run.Streams)
			logger.Printf("  The newest run looks incomplete. Consider --fresh.")
			break
		}
	}

	objects, err := store.List(ctx, bucket, path.Join(keyPrefix, newest.Name)+"/")
	if err != nil {
		return err
	}
	logger.Printf("Carrying NATS run %s: %d stream(s).", newest.Name, newest.Streams)

	return copyObjects(ctx, store, writer, snapshot.TargetNatsStreams, bucket, keyPrefix, objects, logger)
}

// addOrgDataToSnapshot carries the platform's own files out of the
// bucket: the glTF models of the digital twins and whatever else
// admin_api's S3 folders hold.
//
// Everything under the prefix, with no selection to make. There is no
// catalogue here and no chain — this is live data, not a backup, so the
// only question is what is there right now.
//
// An empty prefix is not an error. A platform whose digital twins carry
// no models has nothing here, and so does one where nobody has uploaded
// anything yet.
func addOrgDataToSnapshot(
	ctx context.Context,
	pd *pt.PlatformData,
	store *PlatformS3,
	writer *snapshot.Writer,
	logger *log.Logger,
) error {
	prefix := snapshot.SourcePrefix(pd, snapshot.TargetOrgData)
	if prefix == "" {
		return fmt.Errorf("this platform has no S3 bucket, so it has no %s folder",
			snapshot.OrgDataPrefix)
	}
	bucket, keyPrefix, err := ParseS3Prefix(prefix)
	if err != nil {
		return err
	}

	tm := writer.Manifest().EnsureTarget(snapshot.TargetOrgData)
	tm.Prefix = prefix

	objects, err := store.List(ctx, bucket, keyPrefix+"/")
	if err != nil {
		return err
	}
	if len(objects) == 0 {
		logger.Printf("No files in %s yet; the snapshot carries none.", snapshot.OrgDataPrefix)
		return nil
	}

	var total int64
	for _, object := range objects {
		total += object.Size
	}
	logger.Printf("Carrying %s: %d file(s), %s.",
		snapshot.OrgDataPrefix, len(objects), humanSize(total))

	return copyObjects(ctx, store, writer, snapshot.TargetOrgData, bucket, keyPrefix, objects, logger)
}

// addPatroniToSnapshot carries one cluster's wal-g backups.
func addPatroniToSnapshot(
	ctx context.Context,
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	store *PlatformS3,
	writer *snapshot.Writer,
	target snapshot.Target,
	family patroniFamily,
	opts SnapshotOptions,
	logger *log.Logger,
) error {
	prefix := snapshot.SourcePrefix(pd, target)
	if prefix == "" {
		return fmt.Errorf("%s backups are not configured: its WALG_S3_PREFIX is empty", target)
	}
	bucket, keyPrefix, err := ParseS3Prefix(prefix)
	if err != nil {
		return err
	}

	backups, err := listPatroniFamilyBackups(pd, dc, family)
	if err != nil {
		return fmt.Errorf("error listing %s's backups: %w", target, err)
	}

	tm := writer.Manifest().EnsureTarget(target)
	tm.Prefix = prefix
	tm.CompressionMethod = pd.PlatformInfo.WalgCompressionMethod

	if len(backups) == 0 {
		return fmt.Errorf("%s has no backups in its wal-g catalogue. "+
			"Take one first with 'osi4iot backup trigger %s', or run this with --fresh",
			target, target)
	}

	if opts.AllBackups {
		logger.Printf("Carrying every stored object for %s (--all-backups).", target)
		for i := len(backups) - 1; i >= 0; i-- {
			tm.Backups = append(tm.Backups, backupRef(backups[i]))
		}
		tm.PgVersion = backups[0].PgVersion

		objects, err := store.List(ctx, bucket, keyPrefix+"/")
		if err != nil {
			return err
		}
		return copyObjects(ctx, store, writer, target, bucket, keyPrefix, objects, logger)
	}

	chain, err := selectWalgChain(backups)
	if err != nil {
		return fmt.Errorf("%s: %w", target, err)
	}
	for _, backup := range chain {
		tm.Backups = append(tm.Backups, backupRef(backup))
	}
	tm.PgVersion = chain[len(chain)-1].PgVersion

	// Two listings rather than one over the whole prefix: the WAL
	// directory can hold tens of thousands of segments going back
	// months, and only the ones after the base backup are of any use.
	baseObjects, err := store.List(ctx, bucket, path.Join(keyPrefix, walgBaseBackupsDir)+"/")
	if err != nil {
		return err
	}
	walObjects, err := store.List(ctx, bucket, path.Join(keyPrefix, walgWALDir)+"/")
	if err != nil {
		return err
	}

	wanted, cutoff := planWalgObjects(keyPrefix, chain, baseObjects, walObjects)

	logger.Printf("Carrying %s: %d backup(s), %d object(s), restoring from %s.",
		target, len(chain), len(wanted), chain[len(chain)-1].Name)
	if !cutoff.IsZero() {
		logger.Printf("  WAL from %s onwards.", cutoff.Local().Format("2006-01-02 15:04"))
	}

	return copyObjects(ctx, store, writer, target, bucket, keyPrefix, wanted, logger)
}

// selectWalgChain picks the newest restorable backup and returns its
// ancestry, base first.
//
// backups arrives newest first, as system_manager's catalogue reports
// it. A delta whose parent is missing is unrestorable on its own, so
// the newest one is not automatically the right starting point — the
// search walks back until it finds one whose whole chain is present.
func selectWalgChain(backups []PatroniBackup) ([]PatroniBackup, error) {
	byName := make(map[string]PatroniBackup, len(backups))
	for _, backup := range backups {
		byName[backup.Name] = backup
	}

	for _, candidate := range backups {
		if candidate.ChainBroken {
			continue
		}

		var chain []PatroniBackup
		current := candidate
		complete := true

		// Bounded by the catalogue's size: a cycle in ParentName would
		// otherwise spin here, and wal-g's catalogue is not something
		// this CLI gets to assume is well formed.
		for i := 0; i <= len(backups); i++ {
			chain = append([]PatroniBackup{current}, chain...)
			if current.ParentName == "" {
				break
			}
			parent, ok := byName[current.ParentName]
			if !ok {
				complete = false
				break
			}
			current = parent
			if i == len(backups) {
				complete = false
			}
		}

		if complete && chain[0].Kind != "delta" {
			return chain, nil
		}
	}

	return nil, fmt.Errorf("no restorable backup in the catalogue: every candidate is a delta " +
		"whose base is missing. Take a fresh backup before snapshotting")
}

// planWalgObjects decides which stored objects belong in the bundle,
// and from when the WAL is carried.
//
// Base backups are matched by exact membership rather than by key
// prefix, because "base_0003" is a prefix of "base_00031" too and a
// sloppy match would quietly drag in a neighbouring backup.
func planWalgObjects(
	keyPrefix string,
	chain []PatroniBackup,
	baseObjects, walObjects []s3Object,
) ([]s3Object, time.Time) {
	baseDir := path.Join(keyPrefix, walgBaseBackupsDir) + "/"

	inChain := make(map[string]bool, len(chain))
	for _, backup := range chain {
		inChain[backup.Name] = true
	}

	var wanted []s3Object
	cutoff := time.Time{}

	for _, object := range baseObjects {
		rest := strings.TrimPrefix(object.Key, baseDir)
		if rest == object.Key {
			continue
		}

		name := ""
		if i := strings.Index(rest, "/"); i > 0 {
			name = rest[:i] // objects inside a backup's directory
		} else if strings.HasSuffix(rest, walgSentinelSuffix) {
			name = strings.TrimSuffix(rest, walgSentinelSuffix)
		}
		if name == "" || !inChain[name] {
			continue
		}

		wanted = append(wanted, object)
		if name == chain[0].Name && !object.ModTime.IsZero() {
			if cutoff.IsZero() || object.ModTime.Before(cutoff) {
				cutoff = object.ModTime
			}
		}
	}

	if !cutoff.IsZero() {
		cutoff = cutoff.Add(-walSafetyMargin)
	}

	for _, object := range walObjects {
		// Timeline history files are tiny and are what tells recovery
		// which timeline to follow, including across an earlier
		// restore. Carrying all of them costs nothing.
		if strings.Contains(object.Key, ".history") {
			wanted = append(wanted, object)
			continue
		}
		if cutoff.IsZero() || !object.ModTime.Before(cutoff) {
			wanted = append(wanted, object)
		}
	}

	return wanted, cutoff
}

// backupRef converts a catalogue entry into what the manifest records.
func backupRef(backup PatroniBackup) snapshot.PatroniBackupRef {
	return snapshot.PatroniBackupRef{
		Name:       backup.Name,
		Kind:       backup.Kind,
		ParentName: backup.ParentName,
		Time:       backup.Time,
	}
}

// copyObjects streams each object out of the bucket and into the
// bundle, recording it in the manifest.
//
// Keys go in relative to keyPrefix, which is what lets the far side
// re-upload them under a prefix of its own.
func copyObjects(
	ctx context.Context,
	store *PlatformS3,
	writer *snapshot.Writer,
	target snapshot.Target,
	bucket, keyPrefix string,
	objects []s3Object,
	logger *log.Logger,
) error {
	var total int64
	for _, object := range objects {
		total += object.Size
	}

	var done int64
	for i, object := range objects {
		relKey := strings.TrimPrefix(strings.TrimPrefix(object.Key, keyPrefix), "/")
		if relKey == "" {
			continue
		}

		body, err := store.Get(ctx, bucket, object.Key)
		if err != nil {
			return err
		}

		_, addErr := writer.AddObject(target, relKey, object.Size, object.ModTime, body)
		// Closing reports whatever the source only learns at the end:
		// for the mc path, the exit status of the process that produced
		// these bytes.
		closeErr := body.Close()
		if addErr != nil {
			return addErr
		}
		if closeErr != nil {
			return closeErr
		}

		done += object.Size
		// Per-object logging would be thousands of lines on a WAL
		// directory, and no logging at all looks like a hang during a
		// multi-gigabyte copy.
		if (i+1)%25 == 0 || i == len(objects)-1 {
			logger.Printf("  %s: %d/%d object(s), %s of %s",
				target, i+1, len(objects), humanSize(done), humanSize(total))
		}
	}

	return nil
}

// humanSize renders a byte count. Mirrors cmd/backup_commands.go's
// formatBytes; kept here so this file does not depend on the cmd
// package.
func humanSize(n int64) string {
	if n <= 0 {
		return "0 B"
	}
	const unit = 1024.0
	value := float64(n)
	for _, suffix := range []string{"B", "KiB", "MiB", "GiB", "TiB"} {
		if value < unit {
			return fmt.Sprintf("%.0f %s", value, suffix)
		}
		value /= unit
	}
	return fmt.Sprintf("%.1f PiB", value)
}