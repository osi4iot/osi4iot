package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/snapshot"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// `osi4iot init --from-bucket s3://name` stands a platform up again
// from the bucket it was backing up to, with no zip involved.
//
// DeletePlatform never touches S3, so an external bucket outlives the
// platform: the encrypted state file backups, both wal-g catalogues,
// the NATS runs and org_data are all still there. Everything an
// osi4iot_snapshot.zip carries, already in place. This is the same
// pipeline as `init --snapshot-file` with the expensive step removed —
// there is nothing to seed, because nothing ever left.
//
// It does not apply to "Local Minio": that bucket lives in the
// minio_storage volume, and delete takes the volume.

const (
	fromBucketFlag  = "from-bucket"
	nodesFileFlag   = "nodes"
	statePrefixFlag = "state-prefix"
	bucketRegionFlg = "bucket-region"
)

// capturedCatalogue is read before the platform starts and used after
// it does.
//
// A package-level variable because the two halves live in different
// functions on either side of InitPlatform, and because the reason it
// exists is precisely that it cannot be read later: once the platform
// is up with empty clusters, system_manager's scheduled backup can push
// a backup of that emptiness into this same bucket, and it would be the
// newest one.
var capturedCatalogue docker.BucketCatalogue

// PrepareInitFromBucket configures this machine from a bucket, so the
// rest of `init` can run normally. A no-op unless --from-bucket is
// given.
//
// Called from main.go beside PrepareInitFromSnapshot.
func PrepareInitFromBucket(args []string) error {
	bucket := flagValueFromArgs(args, fromBucketFlag)
	if bucket == "" {
		return nil
	}
	if SnapshotFileFromArgs(args) != "" {
		return fmt.Errorf("--%s and --%s both say where the platform comes from: pick one",
			fromBucketFlag, snapshotFileFlag)
	}

	logger := log.New(os.Stdout, "", 0)
	ctx := context.Background()

	opts := docker.ExternalBucketOptions{
		Bucket:    strings.TrimPrefix(strings.TrimSpace(bucket), "s3://"),
		KeyPrefix: flagValueFromArgs(args, statePrefixFlag),
		Region:    flagValueFromArgs(args, bucketRegionFlg),
	}
	opts.Bucket = strings.Trim(opts.Bucket, "/")

	logger.Printf("Reading s3://%s ...", opts.Bucket)
	store, err := docker.OpenExternalBucket(ctx, opts)
	if err != nil {
		return fmt.Errorf("%w\n"+
			"Credentials come from the usual AWS places — AWS_ACCESS_KEY_ID and "+
			"AWS_SECRET_ACCESS_KEY, a shared profile, or an instance role — because the "+
			"platform's own are inside the state file this is trying to read", err)
	}
	defer store.Close()

	backup, err := docker.LatestStateBackup(ctx, store, opts)
	if err != nil {
		return err
	}
	logger.Printf("Newest state file backup: %s (%s), %d in the bucket.",
		backup.Taken.Local().Format("Mon, 02 Jan 2006 15:04:05 MST"),
		humanBytes(backup.Size), backup.Objects)

	// Same resume rule as the snapshot path: a state file for the same
	// platform means this is a retry, and a different one means a
	// mistyped command.
	if utils.ExistStateFile() {
		existing, err := existingPlatformDomain()
		if err != nil {
			return fmt.Errorf("there is already a state file on this machine (%s) and it "+
				"could not be read: %w", utils.GetStateFilePath(), err)
		}
		logger.Printf("This machine is already configured for '%s'; keeping its state file.",
			existing)
		return captureCatalogue(ctx, store, data.GetData(), logger)
	}

	blob, err := docker.FetchStateBackup(ctx, store, opts.Bucket, backup.Key)
	if err != nil {
		return err
	}
	plaintext, err := decryptStateBackup(blob)
	if err != nil {
		return err
	}

	var restored pt.PlatformData
	if err := json.Unmarshal(plaintext, &restored); err != nil {
		return fmt.Errorf("the state file decrypted, but its contents are not valid JSON: %w", err)
	}
	if restored.PlatformInfo.DomainName == "" {
		return fmt.Errorf("the state file has no domain name in it — it does not look like one")
	}

	logger.Printf("\nPlatform:  %s (%s)", restored.PlatformInfo.PlatformName,
		restored.PlatformInfo.DomainName)
	logger.Printf("Layout:    %s, %d node(s)", restored.PlatformInfo.DeploymentLocation,
		len(restored.PlatformInfo.NodesData))

	if err := resolveNodes(&restored, flagValueFromArgs(args, nodesFileFlag),
		assumeYesFromArgs(args), logger); err != nil {
		return err
	}

	// Before the state file lands on disk, so a refusal leaves nothing
	// behind.
	if err := confirmBucketInit(&restored, opts.Bucket, assumeYesFromArgs(args), logger); err != nil {
		return err
	}

	*data.GetData() = restored
	if err := utils.WritePlatformDataToFile(data.GetData()); err != nil {
		return fmt.Errorf("error saving the state file: %w", err)
	}
	logger.Printf("Configured this machine as platform '%s' (domain %s).",
		restored.PlatformInfo.PlatformName, restored.PlatformInfo.DomainName)

	return captureCatalogue(ctx, store, &restored, logger)
}

// captureCatalogue records what the bucket held before anything starts.
func captureCatalogue(ctx context.Context, store *docker.PlatformS3, pd *pt.PlatformData, logger *log.Logger) error {
	catalogue, err := docker.CaptureBucketCatalogue(ctx, store, pd)
	if err != nil {
		return fmt.Errorf("%w\nWithout a backup to restore from there is nothing to bring "+
			"this platform back to", err)
	}

	capturedCatalogue = catalogue

	if catalogue.AdminBackup != "" {
		logger.Printf("Will restore patroni_admin from %s", catalogue.AdminBackup)
	}
	if catalogue.MetricsBackup != "" {
		logger.Printf("Will restore patroni_metrics from %s", catalogue.MetricsBackup)
	}
	if catalogue.NatsRun != "" {
		logger.Printf("Will restore the NATS streams from run %s", catalogue.NatsRun)
	} else {
		logger.Printf("No NATS backup runs in the bucket; the streams will come back empty.")
	}
	return nil
}

// resolveNodes decides which machines the platform will run on.
//
// Three ways, in order of how much the operator has to do:
//
//   - A local deployment has exactly one node, this machine, and
//     InitPlatform recomputes it from GetLocalNodeData. Nothing to ask.
//   - --nodes points at a file the operator has already edited.
//   - Otherwise the list from the state file is shown and confirmed.
//     Saying no writes that list out as nodes.json and stops, because
//     the one thing an operator cannot do is author that file from
//     scratch: what is in it was inside the encrypted state file they
//     could not read.
func resolveNodes(pd *pt.PlatformData, nodesPath string, assumeYes bool, logger *log.Logger) error {
	if pd.PlatformInfo.DeploymentLocation == snapshot.LocationLocal {
		logger.Printf("Local deployment: this machine is the node.")
		return nil
	}

	if nodesPath != "" {
		raw, err := os.ReadFile(nodesPath)
		if err != nil {
			return fmt.Errorf("error reading %s: %w", nodesPath, err)
		}
		var overlay snapshot.NodesOverlay
		if err := json.Unmarshal(raw, &overlay); err != nil {
			return fmt.Errorf("%s is not valid JSON: %w", nodesPath, err)
		}
		if err := snapshot.ApplyNodes(pd, &overlay); err != nil {
			return fmt.Errorf("%s cannot be applied: %w", nodesPath, err)
		}
		for _, warning := range overlay.Warnings() {
			logger.Printf("Warning: %s", warning)
		}
		logger.Printf("Applied %s: %d node(s), %s.",
			nodesPath, len(overlay.Nodes), overlay.DeploymentLocation)
		return nil
	}

	printNodes(pd, logger)

	// Validated even when kept: a state file that has been sitting in a
	// bucket for months can carry a role spelling that matches nothing,
	// and this is the last moment anyone looks at it.
	overlay := snapshot.ExtractNodes(pd)
	if err := overlay.Validate(); err != nil {
		return fmt.Errorf("the node list in the state file is not usable: %w.\n"+
			"Fix it in a nodes.json and pass --%s", err, nodesFileFlag)
	}
	for _, warning := range overlay.Warnings() {
		logger.Printf("Warning: %s", warning)
	}

	if assumeYes {
		return nil
	}

	answer, err := promptLine("\nAre these the machines this platform will run on? [Y/n]: ")
	if err != nil {
		return err
	}
	if answer == "" || strings.EqualFold(answer, "y") || strings.EqualFold(answer, "yes") {
		return nil
	}

	return writeNodesTemplate(overlay)
}

// writeNodesTemplate leaves the current list on disk for the operator
// to edit, and stops.
func writeNodesTemplate(overlay snapshot.NodesOverlay) error {
	const path = "nodes.json"

	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("%s already exists here. Edit it and pass --%s %s, or move it aside",
			path, nodesFileFlag, path)
	}

	encoded, err := json.MarshalIndent(overlay, "", "  ")
	if err != nil {
		return fmt.Errorf("error writing %s: %w", path, err)
	}
	if err := os.WriteFile(path, append(encoded, '\n'), 0600); err != nil {
		return fmt.Errorf("error writing %s: %w", path, err)
	}

	return fmt.Errorf("wrote %s with the current list.\n"+
		"Edit the addresses, roles and users to match the machines you are using, then run:\n\n"+
		"  osi4iot init --%s <bucket> --%s %s\n\n"+
		"Nothing has been changed on this machine",
		path, fromBucketFlag, nodesFileFlag, path)
}

// printNodes shows the machines the state file describes.
func printNodes(pd *pt.PlatformData, logger *log.Logger) {
	logger.Printf("\nThe state file describes these machines:\n")
	for i, node := range pd.PlatformInfo.NodesData {
		name := node.NodeLabel
		if name == "" {
			name = fmt.Sprintf("node %d", i+1)
		}
		logger.Printf("  %-20s %-16s %-16s %s",
			name, node.NodeIP, node.NodeRole, node.NodeUserName)
	}
}

// confirmBucketInit is the last stop before the state file is written.
func confirmBucketInit(pd *pt.PlatformData, bucket string, assumeYes bool, logger *log.Logger) error {
	logger.Printf("\nThis will configure THIS machine as '%s' and start it, restoring from "+
		"s3://%s.", pd.PlatformInfo.PlatformName, bucket)

	// The bucket is the live one, not a copy. If the old platform is
	// still running against it, both will archive WAL over each other
	// and both catalogues become unusable — and nothing here can tell
	// whether it is.
	logger.Printf("The platform this bucket belongs to must not still be running: they would")
	logger.Printf("share a domain, a certificate and this bucket's wal-g prefixes.")

	if assumeYes {
		return nil
	}

	answer, err := promptLine("\nContinue? [y/N]: ")
	if err != nil {
		return err
	}
	if !strings.EqualFold(answer, "y") && !strings.EqualFold(answer, "yes") {
		return fmt.Errorf("cancelled")
	}
	return nil
}

// finishInitFromBucket restores the platform after init has brought it
// up empty.
//
// Called from cmdInit, and the mirror of finishInitFromSnapshot without
// the seeding: the objects never left the bucket.
func finishInitFromBucket(pd *pt.PlatformData) error {
	logger := log.New(os.Stdout, "", 0)

	dc, err := docker.GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting docker client: %w", err)
	}

	// By the name captured before the platform started. Asking for
	// LATEST now could pick up a backup of the empty clusters this init
	// just created.
	for _, target := range []snapshot.Target{snapshot.TargetPatroniAdmin, snapshot.TargetPatroniMetrics} {
		name := capturedCatalogue.AdminBackup
		if target == snapshot.TargetPatroniMetrics {
			name = capturedCatalogue.MetricsBackup
		}
		if name == "" {
			continue
		}

		logger.Printf("\nRestoring %s from %s...", target, name)
		opts := docker.PatroniRestoreOptions{Backup: name}
		if target == snapshot.TargetPatroniAdmin {
			err = docker.RestorePatroniAdmin(pd, dc, opts, logger)
		} else {
			err = docker.RestorePatroniMetrics(pd, dc, opts, logger)
		}
		if err != nil {
			return fmt.Errorf("error restoring %s: %w", target, err)
		}
	}

	if capturedCatalogue.NatsRun != "" {
		if err := restoreSeededNatsRun(pd, dc, capturedCatalogue.NatsRun, logger); err != nil {
			return err
		}
	}

	logger.Printf("\nDeploying %s...", strings.Join(docker.DeferredUntilRestored, ", "))
	pd.PlatformInfo.ExcludedServices = []string{}
	if err := docker.RunSwarm(dc, pd); err != nil {
		return fmt.Errorf("error deploying %s: %w",
			strings.Join(docker.DeferredUntilRestored, ", "), err)
	}

	logger.Printf("\nThe platform is back, with the data the bucket held.")
	logger.Printf("Two things are still yours to do:")
	logger.Printf("  - point %s at this machine", pd.PlatformInfo.DomainName)
	logger.Printf("  - take a snapshot once you are satisfied: osi4iot backup snapshot")
	return nil
}

// flagValueFromArgs reads a --name value or --name=value out of a raw
// argument list.
//
// Hand-parsed for the same reason as SnapshotFileFromArgs: main.go has
// to know before Cobra parses anything, because the decision of whether
// this init can run without a state file is made earlier than that.
func flagValueFromArgs(args []string, name string) string {
	for i, arg := range args {
		switch {
		case arg == "--"+name:
			if i+1 < len(args) {
				return args[i+1]
			}
		case strings.HasPrefix(arg, "--"+name+"="):
			return strings.TrimPrefix(arg, "--"+name+"=")
		}
	}
	return ""
}

// humanBytes renders a byte count for the listing above.
func humanBytes(n int64) string {
	if n <= 0 {
		return "0 B"
	}
	const unit = 1024.0
	value := float64(n)
	for _, suffix := range []string{"B", "KiB", "MiB", "GiB"} {
		if value < unit {
			return fmt.Sprintf("%.0f %s", value, suffix)
		}
		value /= unit
	}
	return fmt.Sprintf("%.1f TiB", value)
}