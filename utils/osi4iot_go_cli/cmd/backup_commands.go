package cmd

import (
	"fmt"
	"slices"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/spf13/cobra"
)

// This file adds a single, consistent entry point for triggering and
// restoring platform backups — `osi4iot backup trigger TARGET` and
// `osi4iot backup restore TARGET` — instead of each backed-up component
// having its own bespoke subcommand shape. It replaces the old
// `osi4iot streams backup` command (see the removed subCmdStreamsBackup
// in commands.go): that command snapshotted NATS to a local directory
// on the manager host, which `backup trigger nats` now does through
// system_manager, uploading to S3 instead (see
// system_manager/internal/natsbackup).
//
// `osi4iot streams backups` / `streams restore` / `streams backups rm`
// are UNCHANGED and still work exactly as before — they manage the
// LOCAL, temporary snapshots the scale up/down flow takes of its own
// accord mid-operation (see services.go and nats_backup_restore.go's
// package doc comment), which is a different thing from the S3 backups
// this file triggers and restores, and stays local by design.
//
// patroni_admin/patroni_metrics backups already ran on their own daily
// schedule inside system_manager (see backup.LoadTargets), but had no
// CLI command to trigger one on demand even though system_manager
// already exposed system_manager.patroni.trigger_backup.<n> for exactly
// that. `backup trigger patroni_admin`/`patroni_metrics` fill that gap.
// There is deliberately no `backup restore patroni_admin`/
// `patroni_metrics` yet: Postgres restore is a more involved,
// higher-stakes procedure than a JetStream snapshot restore, and isn't
// exposed by system_manager as a task at all today — see
// MIGRATION_NOTES.md.

// backupTargets lists every valid `backup trigger` TARGET, in the order
// they're shown in help/error text.
var backupTargets = []string{"patroni_admin", "patroni_metrics", "nats_streams"}

// restoreTargets lists every valid `backup restore` TARGET — a subset of
// backupTargets today (see the file doc comment above).
var restoreTargets = []string{"nats_streams"}

var cmdBackup = &cobra.Command{
	Use:   "backup",
	Short: "Trigger and restore platform backups",
	Long: "Trigger on-demand backups and restores for patroni_admin, patroni_metrics, and NATS streams.",
}

var subCmdBackupTrigger = &cobra.Command{
	Use:   "trigger TARGET",
	Short: "Trigger an on-demand backup right now",
	Long: "Triggers a backup through system_manager, for one of: " +
		strings.Join(backupTargets, ", ") + ". Blocks until system_manager reports the outcome.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		target := args[0]

		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}

		var output string
		switch target {
		case "patroni_admin":
			output, err = docker.TriggerPatroniAdminBackup(pd, dc)
		case "patroni_metrics":
			output, err = docker.TriggerPatroniMetricsBackup(pd, dc)
		case "nats_streams":
			output, err = docker.TriggerNatsBackup(pd, dc)
		default:
			exitWithError(fmt.Sprintf("Unknown backup target %q (expected one of: %s)",
				target, strings.Join(backupTargets, ", ")))
			return
		}
		if err != nil {
			exitWithError(fmt.Sprintf("Error triggering %s backup: %v", target, err))
		}

		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("%s backup triggered successfully", target)))
		if strings.TrimSpace(output) != "" {
			fmt.Println(output)
		}
	},
}

var subCmdBackupRestore = &cobra.Command{
	Use:   "restore TARGET",
	Short: "Restore from the most recent backup",
	Long: "Restores from the most recent backup, through system_manager, for one of: " +
		strings.Join(restoreTargets, ", ") + ". Existing data for that target is deleted first — " +
		"this cannot be undone.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		target := args[0]
		yes, _ := cmd.Flags().GetBool("yes")

		if !slices.Contains(restoreTargets, target) {
			exitWithError(fmt.Sprintf("Unsupported restore target %q (expected one of: %s)",
				target, strings.Join(restoreTargets, ", ")))
			return
		}

		if !yes && !confirmStreamsAction(fmt.Sprintf(
			"Restore %s from the most recent S3 backup? Existing data with the same name will be "+
				"DELETED first. This cannot be undone.", target)) {
			fmt.Println("Cancelled.")
			return
		}

		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}

		var output string
		switch target {
		case "nats_streams":
			output, err = docker.RestoreNatsBackupFromS3(pd, dc)
		}
		if err != nil {
			exitWithError(fmt.Sprintf("Error restoring %s: %v", target, err))
		}

		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("%s restored from the most recent S3 backup", target)))
		if strings.TrimSpace(output) != "" {
			fmt.Println(output)
		}
	},
}

func init() {
	subCmdBackupRestore.Flags().BoolP("yes", "y", false, "Skip the confirmation prompt")

	cmdBackup.AddCommand(subCmdBackupTrigger)
	cmdBackup.AddCommand(subCmdBackupRestore)
	rootCmd.AddCommand(cmdBackup)
}
