package docker

import (
	"context"
	"fmt"
	"log"
	"os"
	"path"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/snapshot"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file is the inverse of snapshot_source.go: it takes the objects
// out of an osi4iot_snapshot.zip and puts them into the object store of
// a platform that has just been initialised, so the normal restore
// paths — RestorePatroniAdmin, RestorePatroniMetrics,
// RestoreNatsBackupFromS3 — find a catalogue to work from.
//
// # It runs after init, not during it
//
// The obvious-looking alternative is to seed the bucket first and let
// Patroni bootstrap straight from wal-g. It does not work here, for two
// reasons.
//
// The first is admin_api. Its dataBaseInitialization creates the
// platform's bucket, and when the bucket already exists it EMPTIES it —
// so anything seeded before admin_api's first run is deleted by it.
// Seeding afterwards is not a preference, it is the only ordering that
// survives. index.ts awaits dataBaseInitialization before app.listen,
// so admin_api cannot report healthy until that has happened, and
// waitUntilAllContainersAreHealthy waits on every task of every
// service: by the time InitPlatform returns, the bucket exists and has
// been emptied for the last time.
//
// The second is that PATRONI_BOOTSTRAP_METHOD and friends live only in
// the live service spec, deliberately — patroni_restore.go keeps them
// out of PlatformData so a restore bootstrap cannot linger across a
// deployment. Putting them into GenerateServices to make a phased init
// work would break that.
//
// So the platform comes up empty, gets its bucket seeded, and is then
// restored by the same code an operator would run by hand.

// SeedOptions configures one seeding run.
type SeedOptions struct {
	// Targets restricts what is seeded. Empty means everything the
	// bundle carries, apart from the state file, which is installed on
	// disk rather than uploaded.
	Targets []snapshot.Target
	// MinioImage overrides the image the MinIO client helper runs.
	MinioImage string
}

// SeedFromSnapshot uploads the bundle's objects into the platform's
// object store, under the prefixes the CURRENT state file names.
//
// The bundle's own prefixes are only recorded, never used as
// destinations: entries carry keys relative to their target's prefix
// precisely so a snapshot taken from one prefix can be restored into
// another.
func SeedFromSnapshot(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	reader *snapshot.Reader,
	opts SeedOptions,
	logger *log.Logger,
) error {
	ctx := context.Background()

	targets := seedTargets(reader.Manifest(), opts.Targets)
	if len(targets) == 0 {
		logger.Printf("The snapshot carries no stored backups, so there is nothing to seed.")
		return nil
	}

	store, err := OpenPlatformS3(ctx, pd, dc, opts.MinioImage, logger)
	if err != nil {
		return err
	}
	defer store.Close()

	// Normally already done by EnsurePlatformBucket during the init, so
	// this is just insurance for the paths that reach a seed without
	// one — and it costs a single call.
	created, err := store.EnsureBucket(ctx, pd.PlatformInfo.S3BucketName)
	if err != nil {
		return err
	}
	if created {
		logger.Printf("Created the platform's bucket '%s'.", pd.PlatformInfo.S3BucketName)
	}

	// One object at a time on disk. The AWS SDK rewinds a body to retry
	// a failed upload, which a zip entry cannot do, so each object is
	// spooled to a file first — which also means the archive's SHA-256
	// is verified before anything is uploaded rather than after.
	spoolDir, err := os.MkdirTemp("", "osi4iot-seed-")
	if err != nil {
		return fmt.Errorf("error creating a temporary directory: %w", err)
	}
	defer os.RemoveAll(spoolDir)

	for _, target := range targets {
		if err := seedTarget(ctx, pd, store, reader, target, spoolDir, logger); err != nil {
			return err
		}
	}

	return nil
}

// seedTargets works out what to seed: what the bundle has, minus the
// state file, narrowed by the caller's list if there is one.
func seedTargets(manifest *snapshot.Manifest, wanted []snapshot.Target) []snapshot.Target {
	var targets []snapshot.Target
	for _, target := range manifest.IncludedTargets() {
		if target == snapshot.TargetState {
			continue
		}
		if len(wanted) > 0 && !snapshot.Contains(wanted, target) {
			continue
		}
		if len(manifest.Target(target).Entries) == 0 {
			continue
		}
		targets = append(targets, target)
	}
	return targets
}

// seedTarget uploads one target's objects and then checks they are
// there.
func seedTarget(
	ctx context.Context,
	pd *pt.PlatformData,
	store *PlatformS3,
	reader *snapshot.Reader,
	target snapshot.Target,
	spoolDir string,
	logger *log.Logger,
) error {
	destination := snapshot.SourcePrefix(pd, target)
	if destination == "" {
		return fmt.Errorf("this platform has no prefix configured for %s, so its backups "+
			"have nowhere to go", target)
	}
	bucket, keyPrefix, err := ParseS3Prefix(destination)
	if err != nil {
		return err
	}

	entries := reader.Entries(target)
	manifestTarget := reader.Manifest().Target(target)

	if source := manifestTarget.Prefix; source != "" && source != destination {
		logger.Printf("%s: %s  ->  %s", target, source, destination)
	}

	// A prefix that already holds objects is not fatal — a platform
	// that has been up for a few minutes may have taken a scheduled
	// backup of its own empty cluster — but it is worth saying, because
	// it is why a restore here must name its backup instead of asking
	// for LATEST.
	if existing, err := store.List(ctx, bucket, keyPrefix+"/"); err == nil && len(existing) > 0 {
		logger.Printf("  Note: %s already holds %d object(s) from this platform.", destination, len(existing))
	}

	var total int64
	for _, entry := range entries {
		total += entry.Size
	}
	logger.Printf("Seeding %s: %d object(s), %s.", target, len(entries), humanSize(total))

	var done int64
	for i, entry := range entries {
		spooled, err := reader.ExtractEntry(entry, spoolDir)
		if err != nil {
			return err
		}

		err = uploadSpooled(ctx, store, bucket, path.Join(keyPrefix, entry.ObjectKey), entry.Size, spooled)
		os.Remove(spooled)
		if err != nil {
			return err
		}

		done += entry.Size
		if (i+1)%25 == 0 || i == len(entries)-1 {
			logger.Printf("  %s: %d/%d object(s), %s of %s",
				target, i+1, len(entries), humanSize(done), humanSize(total))
		}
	}

	return verifySeeded(ctx, store, bucket, keyPrefix, target, entries, logger)
}

// uploadSpooled sends one spooled file.
//
// The *os.File is handed over as-is rather than wrapped: the AWS SDK
// type-asserts the body for io.Seeker to rewind it on a retry, and a
// wrapper would hide that.
func uploadSpooled(ctx context.Context, store *PlatformS3, bucket, key string, size int64, spooledPath string) error {
	file, err := os.Open(spooledPath)
	if err != nil {
		return fmt.Errorf("error reading the spooled %s: %w", key, err)
	}
	defer file.Close()

	return store.Put(ctx, bucket, key, size, file)
}

// verifySeeded lists the destination and checks every entry arrived at
// the right size.
//
// Cheap — one listing per target — and it closes a gap nothing else
// covers: an upload that succeeded against a bucket something else then
// emptied looks exactly like an upload that worked. That is not
// hypothetical here; it is what admin_api's dataBaseInitialization does
// to an existing bucket, and the reason this whole step runs where it
// does.
func verifySeeded(
	ctx context.Context,
	store *PlatformS3,
	bucket, keyPrefix string,
	target snapshot.Target,
	entries []snapshot.Entry,
	logger *log.Logger,
) error {
	stored, err := store.List(ctx, bucket, keyPrefix+"/")
	if err != nil {
		return fmt.Errorf("error checking what was seeded into %s: %w", target, err)
	}

	sizes := make(map[string]int64, len(stored))
	for _, object := range stored {
		sizes[object.Key] = object.Size
	}

	var missing, wrongSize []string
	for _, entry := range entries {
		key := path.Join(keyPrefix, entry.ObjectKey)
		size, ok := sizes[key]
		switch {
		case !ok:
			missing = append(missing, entry.ObjectKey)
		case entry.Size > 0 && size != entry.Size:
			wrongSize = append(wrongSize, entry.ObjectKey)
		}
	}

	if len(missing) == 0 && len(wrongSize) == 0 {
		logger.Printf("  %s: all %d object(s) verified in the bucket.", target, len(entries))
		return nil
	}

	var complaint strings.Builder
	fmt.Fprintf(&complaint, "%s did not seed correctly: ", target)
	if len(missing) > 0 {
		fmt.Fprintf(&complaint, "%d object(s) are not in the bucket (e.g. %s)",
			len(missing), missing[0])
	}
	if len(wrongSize) > 0 {
		if len(missing) > 0 {
			complaint.WriteString(", and ")
		}
		fmt.Fprintf(&complaint, "%d have the wrong size (e.g. %s)", len(wrongSize), wrongSize[0])
	}
	complaint.WriteString(".\nSomething removed them after they were uploaded. " +
		"Check that admin_api has not re-run its bucket initialisation")

	return fmt.Errorf("%s", complaint.String())
}