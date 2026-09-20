package cmd

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/snapshot"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/spf13/cobra"
)

// `osi4iot backup snapshot` writes one portable file holding everything
// needed to stand this platform up somewhere else: the state file, the
// NATS stream backups and the wal-g backups of both Patroni clusters.
//
// It sits under `backup` rather than under `state` on purpose. This IS
// a backup operation, symmetric with trigger/restore/list, and it takes
// the same target names they do. `osi4iot state export` keeps its own,
// much narrower meaning — decrypt the state file to plain JSON for
// debugging — and the two must not be confused: one produces an
// encrypted bundle and the other produces every credential the platform
// has in the clear.
//
// There is no `backup import`. The bundle is consumed by
// `osi4iot init --snapshot-file`, which is where standing a platform up
// already lives, and seeding the new object store from the bundle is a
// step of that, not a verb of its own.

var (
	snapshotInclude    []string
	snapshotOutput     string
	snapshotFresh      bool
	snapshotAllBackups bool
	snapshotMinioImage string
)

var subCmdBackupSnapshot = &cobra.Command{
	Use:   "snapshot",
	Short: "Write the whole platform to one portable file",
	Long: "Collects the platform state file and the stored backups of " +
		snapshot.JoinTargets(snapshot.AllTargets, ", ") +
		" into a single osi4iot_snapshot.zip.\n\n" +
		"The zip is what 'osi4iot init --snapshot-file' takes to bring the same platform up on " +
		"other machines without losing anything. It is also a perfectly good off-site backup on " +
		"its own: one file, holding every stored backup and the state file that describes them.\n\n" +
		"WHAT IS INSIDE\n\n" +
		"  state/osi4iot_state.json   encrypted, byte for byte as it is on disk\n" +
		"  state/nodes.json           plain text, and the one part meant to be edited\n" +
		"  patroni_admin/ ...         the newest restorable wal-g chain and its WAL\n" +
		"  patroni_metrics/ ...       the same, for the metrics cluster\n" +
		"  nats_streams/<run>/ ...    the newest complete JetStream backup run\n\n" +
		"Only nodes.json is in plain text, because the machines are the one thing that changes " +
		"when a platform moves. Everything else stays encrypted under the passphrase this " +
		"platform's state file already uses.\n\n" +
		"WHAT IT DOES TO THE PLATFORM\n\n" +
		"Nothing is stopped and no data is modified. The WAL of each Patroni cluster is flushed " +
		"first, which is cheap and is what makes the snapshot recover up to the moment it was " +
		"taken rather than up to the last archived segment.\n\n" +
		"--fresh takes a real backup of each target first instead of carrying the newest stored " +
		"one. It is off by default because a full backup-push on a large cluster can run for a " +
		"long time.\n\n" +
		"SIZE\n\n" +
		"The zip is as large as the backups it carries, which for a busy metrics cluster is " +
		"gigabytes. Only the newest restorable backup chain is included; --all-backups carries " +
		"the entire wal-g catalogue instead.\n\n" +
		"EXAMPLES\n\n" +
		"  Everything, to the default file name:\n\n" +
		"    osi4iot backup snapshot\n\n" +
		"  Just the databases, somewhere specific:\n\n" +
		"    osi4iot backup snapshot --include patroni_admin,patroni_metrics \\\n" +
		"      --output /mnt/usb/osi4iot_snapshot.zip\n\n" +
		"  A migration snapshot, with fresh backups of everything:\n\n" +
		"    osi4iot backup snapshot --fresh",
	Args: cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		stdoutLogger := log.New(os.Stdout, "", 0)

		targets, err := snapshot.ParseTargets(snapshotInclude)
		if err != nil {
			exitWithError(err.Error())
			return
		}

		// A snapshot without the state file cannot initialise anything,
		// which is most of the point of the command. It is still a
		// legitimate thing to ask for, so this warns rather than
		// refuses.
		if !snapshot.Contains(targets, snapshot.TargetState) {
			fmt.Println(utils.StyleWarningMsg.Render(
				"This snapshot will not include the state file, so 'osi4iot init --snapshot-file' " +
					"cannot use it."))
		}

		if err := prepareSnapshotOutput(snapshotOutput); err != nil {
			exitWithError(err.Error())
			return
		}

		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
			return
		}
		if !docker.IsSystemManagerRunning(dc) {
			exitWithError("system_manager is not running, so the backup catalogues cannot be read. " +
				"Start the platform first: osi4iot run")
			return
		}

		stdoutLogger.Printf("Taking a snapshot of '%s' (%s)...",
			pd.PlatformInfo.PlatformName, pd.PlatformInfo.DomainName)
		stdoutLogger.Printf("Including: %s\n", snapshot.JoinTargets(targets, ", "))

		opts := docker.SnapshotOptions{
			Output:     snapshotOutput,
			Targets:    targets,
			Fresh:      snapshotFresh,
			AllBackups: snapshotAllBackups,
			MinioImage: snapshotMinioImage,
			CLIVersion: version,
		}

		// The MinIO client helper is removed by CleanResources, which
		// main.go runs on both the normal and the interrupted path.
		defer docker.CloseS3Helpers()

		if err := docker.BuildSnapshot(pd, dc, opts, stdoutLogger); err != nil {
			exitWithError(fmt.Sprintf("Error taking the snapshot: %v", err))
			return
		}

		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("Snapshot written to %s", snapshotOutput)))
		fmt.Println("\nKeep it somewhere the platform is not. It is only as safe as the passphrase")
		fmt.Println("its state file is encrypted with.")
	},
}

// prepareSnapshotOutput checks the destination is usable before any of
// the slow work starts.
//
// It does NOT remove an existing snapshot. Replacing it is the point of
// running the command again, but the replacement only happens once the
// new bundle is complete: BuildSnapshot writes to a .partial file and
// renames over the destination at the end. Deleting here would mean an
// interrupted run leaves neither the old snapshot nor a new one.
func prepareSnapshotOutput(path string) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("--output cannot be empty")
	}
	if !strings.HasSuffix(strings.ToLower(path), ".zip") {
		return fmt.Errorf("--output should end in .zip, and %q does not", path)
	}

	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("%s is a directory", path)
		}
		fmt.Printf("Replacing the existing %s (kept until the new one is complete).\n", path)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("error checking %s: %w", path, err)
	}

	// The .partial file lands beside the destination, so a missing or
	// unwritable directory should fail now rather than after an hour of
	// downloading.
	dir := filepath.Dir(path)
	if info, err := os.Stat(dir); err != nil {
		return fmt.Errorf("cannot write to %s: %w", dir, err)
	} else if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", dir)
	}

	return nil
}

func init() {
	subCmdBackupSnapshot.Flags().StringSliceVar(&snapshotInclude, "include",
		[]string{snapshot.IncludeAll},
		"what to put in the snapshot: 'all', or a comma-separated list of "+
			snapshot.JoinTargets(snapshot.AllTargets, ", "))
	subCmdBackupSnapshot.Flags().StringVarP(&snapshotOutput, "output", "o",
		"osi4iot_snapshot.zip", "where to write the snapshot")
	subCmdBackupSnapshot.Flags().BoolVar(&snapshotFresh, "fresh", false,
		"take a new backup of each target first, instead of carrying the newest stored one")
	subCmdBackupSnapshot.Flags().BoolVar(&snapshotAllBackups, "all-backups", false,
		"carry every stored wal-g backup, not just the newest restorable chain")
	subCmdBackupSnapshot.Flags().StringVar(&snapshotMinioImage, "minio-image", "",
		"MinIO image used to read the bucket (default: the version this platform runs)")
	cmdBackup.AddCommand(subCmdBackupSnapshot)
}