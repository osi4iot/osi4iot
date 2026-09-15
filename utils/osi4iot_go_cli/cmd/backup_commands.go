package cmd

import (
	"fmt"
	"log"
	"os"
	"slices"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/data"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
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
// `state` was added later, for the platform state file
// (osi4iot_state.json) — see cmd/state.go and
// system_manager/internal/statefile. It belongs here because it IS an
// S3-backed backup like the others, and having it under its own verb
// would have meant two places to look for "how do I back things up".
//
// What deliberately did NOT come here is `osi4iot state recover`, the
// offline path for when the state file is gone: it goes straight to a
// downloaded file or to MinIO's volume, needs no running platform and
// no state file, and main.go's pre-run only exempts action "state" from
// requiring one. A `backup` subcommand cannot work without the very
// file it would be restoring.
//
// patroni_admin/patroni_metrics backups already ran on their own daily
// schedule inside system_manager (see backup.LoadTargets), but had no
// CLI command to trigger one on demand even though system_manager
// already exposed system_manager.patroni.trigger_backup.<n> for exactly
// that. `backup trigger patroni_admin`/`patroni_metrics` fill that gap.
// The patroni restores are the one target NOT handled by a
// system_manager task: they destroy and rebuild the cluster's volumes,
// which means a foreground process an operator is watching rather than
// a swarm service that could be rescheduled mid-operation. See
// docker.RestorePatroniAdmin.

// backupTargets lists every valid `backup trigger` TARGET, in the order
// they're shown in help/error text.
var backupTargets = []string{"patroni_admin", "patroni_metrics", "nats_streams", "state"}

// restoreTargets lists every valid `backup restore` TARGET — a subset of
// backupTargets today (see the file doc comment above).
var restoreTargets = []string{"patroni_admin", "patroni_metrics", "nats_streams", "state"}

// listTargets lists every valid `backup list` TARGET — all of them.
//
// The patroni entries get there differently from the other two: their
// backups are wal-g's, and wal-g's own catalogue is the only authority
// on which stored objects form a restorable backup, so system_manager
// asks wal-g rather than listing an S3 prefix. See
// system_manager/internal/patroni_backup/list.go.
var listTargets = []string{"patroni_admin", "patroni_metrics", "nats_streams", "state"}

var cmdBackup = &cobra.Command{
	Use:   "backup",
	Short: "Trigger and restore platform backups",
	Long: "Trigger on-demand backups, list what has been stored, and restore, for " +
		"patroni_admin, patroni_metrics, NATS streams and the platform state file.\n\n" +
		"For data deleted by accident use 'extract' rather than 'restore': it recovers just what " +
		"was lost, without rewinding the whole database.",
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
		case "state":
			output, err = triggerStateFileBackup(pd, dc)
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
	Long: "Restores from a backup, for one of: " + strings.Join(restoreTargets, ", ") +
		". Existing data for that target is deleted first — this cannot be undone.\n\n" +
		"The patroni targets rebuild the whole cluster: the data volumes are cleared and Patroni " +
		"re-bootstraps from wal-g. --target-time recovers to a point in time instead of to the " +
		"latest backup, discarding everything committed after it. Both need the platform running.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		target := args[0]
		yes, _ := cmd.Flags().GetBool("yes")

		if !slices.Contains(restoreTargets, target) {
			exitWithError(fmt.Sprintf("Unsupported restore target %q (expected one of: %s)",
				target, strings.Join(restoreTargets, ", ")))
			return
		}

		// Fetched before the confirmation, because the patroni prompt
		// needs it to list the dependent services that are actually
		// running.
		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}

		isPatroni := target == "patroni_admin" || target == "patroni_metrics"
		if !isPatroni && backupRestoreTargetTime != "" {
			exitWithError("--target-time only applies to the patroni targets")
			return
		}

		if isPatroni {
			if err := confirmPatroniRestore(target, backupRestoreTargetTime, dc, yes); err != nil {
				fmt.Println(err)
				return
			}
		} else {
			// The state file restore keeps a .bak-<timestamp> copy of
			// what it replaces (see installStateFile), so the blanket
			// "this cannot be undone" would be untrue for it — and a
			// warning the operator learns is overstated is a warning
			// they stop reading.
			prompt := fmt.Sprintf(
				"Restore %s from the most recent S3 backup? Existing data with the same name will be "+
					"DELETED first. This cannot be undone.", target)
			if target == "state" {
				prompt = "Replace the local state file with the most recent S3 backup? " +
					"The current one is kept alongside it with a .bak-<timestamp> suffix."
			}
			if !yes && !confirmStreamsAction(prompt) {
				fmt.Println("Cancelled.")
				return
			}
		}

		var output string
		switch target {
		case "patroni_admin":
			err = docker.RestorePatroniAdmin(pd, dc, patroniRestoreOptions(), log.New(os.Stdout, "", 0))
		case "patroni_metrics":
			err = docker.RestorePatroniMetrics(pd, dc, patroniRestoreOptions(), log.New(os.Stdout, "", 0))
		case "nats_streams":
			output, err = docker.RestoreNatsBackupFromS3(pd, dc)
		case "state":
			// Prints its own progress and writes the file itself, so
			// there is no output to relay.
			err = runStateRestoreFromS3(log.New(os.Stdout, "", 0), backupRestoreRun)
		}
		if err != nil {
			exitWithError(fmt.Sprintf("Error restoring %s: %v", target, err))
		}

		what := "the most recent S3 backup"
		if backupRestoreTargetTime != "" {
			what = "a point-in-time recovery to " + backupRestoreTargetTime
		} else if backupRestoreRun != "" {
			what = "backup " + backupRestoreRun
		}
		fmt.Println(utils.StyleOKMsg.Render(fmt.Sprintf("%s restored from %s", target, what)))
		if strings.TrimSpace(output) != "" {
			fmt.Println(output)
		}

		if isPatroni {
			// The retention window counts backups, not timelines, so
			// the base backup this recovery depended on can age out
			// before anyone notices something is wrong. Taking a fresh
			// one now is the cheapest insurance there is, and a PITR
			// promotes a new timeline that nothing has backed up yet.
			fmt.Printf("\nTake a backup of the restored cluster now: osi4iot backup trigger %s\n", target)
		}
	},
}

var (
	backupRestoreRun        string
	backupRestoreTargetTime string

	backupExtractTargetTime string
	backupExtractBackup     string
	backupExtractTable      string
	backupExtractSQL        string
	backupExtractSQLFile    string
	backupExtractOutput     string
	backupExtractApply      bool

	backupApplyFile string
)

var subCmdBackupList = &cobra.Command{
	Use:     "list TARGET",
	Aliases: []string{"ls"},
	Short:   "List the backups stored in S3",
	Long: "Lists the backups stored in S3, newest first, for one of: " +
		strings.Join(listTargets, ", ") + ". Read-only.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		target := args[0]

		if !slices.Contains(listTargets, target) {
			exitWithError(fmt.Sprintf("Cannot list %q (expected one of: %s)",
				target, strings.Join(listTargets, ", ")))
			return
		}

		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}

		switch target {
		case "patroni_admin":
			var backups []docker.PatroniBackup
			if backups, err = docker.ListPatroniAdminBackups(pd, dc); err == nil {
				err = printPatroniBackups(target, backups)
			}
		case "patroni_metrics":
			var backups []docker.PatroniBackup
			if backups, err = docker.ListPatroniMetricsBackups(pd, dc); err == nil {
				err = printPatroniBackups(target, backups)
			}
		case "nats_streams":
			err = printNatsBackupRuns(pd, dc)
		case "state":
			err = runStateList(log.New(os.Stdout, "", 0))
		}
		if err != nil {
			exitWithError(fmt.Sprintf("Error listing %s backups: %v", target, err))
		}
	},
}

// printNatsBackupRuns renders the NATS backup runs, flagging any whose
// stream count differs from the newest run's.
//
// That difference is the visible signature of a backup interrupted
// partway through, and it is exactly what someone scanning this list to
// choose a run needs to notice — restoring a short run silently loses
// whole streams.
func printNatsBackupRuns(pd *pt.PlatformData, dc *pt.DockerClient) error {
	runs, err := docker.ListNatsBackups(pd, dc)
	if err != nil {
		return err
	}
	if len(runs) == 0 {
		fmt.Println("No NATS stream backups stored yet.")
		return nil
	}

	newest := runs[0].Streams
	fmt.Println("NATS stream backups (newest first):")
	for i, run := range runs {
		line := fmt.Sprintf("  %s  %d stream(s)", run.Name, run.Streams)
		if i == 0 {
			line += "  (restored by default)"
		} else if run.Streams != newest {
			line += fmt.Sprintf("  ← differs from the newest run (%d)", newest)
		}
		fmt.Println(line)
	}
	return nil
}

// printPatroniBackups renders a cluster's WAL-G catalogue.
//
// Takes the already-fetched result so the two clusters share one
// formatter without another indirection just to choose which fetch to
// call.
//
// Three things get called out, all of which decide whether a given
// backup is usable and none of which are obvious from a bare list of
// names:
//
//   - full vs delta, because a delta needs its whole ancestor chain;
//   - a broken chain, which makes that delta unrestorable outright;
//   - a PostgreSQL major version that differs from the newest backup's,
//     because restoring across majors does not work — the boundary
//     shows up in a catalogue that spans an upgrade.
func printPatroniBackups(target string, backups []docker.PatroniBackup) error {
	if len(backups) == 0 {
		fmt.Printf("No %s backups in the wal-g catalogue yet.\n", target)
		return nil
	}

	newestPgVersion := backups[0].PgVersion

	fmt.Printf("%s backups (newest first):\n", target)
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "  NAME\tWHEN\tKIND\tSIZE\tPG\tNOTES")
	for _, b := range backups {
		var notes []string
		if b.ChainBroken {
			notes = append(notes, fmt.Sprintf("PARENT %s MISSING — cannot restore", b.ParentName))
		} else if b.Kind == "delta" && b.ParentName != "" {
			notes = append(notes, "on "+b.ParentName)
		}
		if b.PgVersion != 0 && newestPgVersion != 0 && b.PgVersion != newestPgVersion {
			notes = append(notes, fmt.Sprintf("PostgreSQL %d, not %d", b.PgVersion, newestPgVersion))
		}

		fmt.Fprintf(w, "  %s\t%s\t%s\t%s\t%s\t%s\n",
			b.Name,
			formatBackupTime(b.Time),
			b.Kind,
			formatBytes(b.CompressedSize),
			formatPgVersion(b.PgVersion),
			strings.Join(notes, "; "),
		)
	}
	return w.Flush()
}

// formatBackupTime renders wal-g's timestamp readably, falling back to
// the raw value if it is in a shape this doesn't recognize — showing
// something odd beats showing nothing.
func formatBackupTime(value string) string {
	if value == "" {
		return "unknown"
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05Z0700"} {
		if t, err := time.Parse(layout, value); err == nil {
			return t.Local().Format("2006-01-02 15:04")
		}
	}
	return value
}

func formatBytes(n int64) string {
	if n <= 0 {
		return "-"
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

func formatPgVersion(v int) string {
	if v == 0 {
		return "-"
	}
	// wal-g reports the server version number (180000 for 18.0), not
	// the major on its own.
	if v >= 100000 {
		return fmt.Sprintf("%d", v/10000)
	}
	return fmt.Sprintf("%d", v)
}

// patroniRestoreOptions assembles the flags a patroni restore takes.
func patroniRestoreOptions() docker.PatroniRestoreOptions {
	return docker.PatroniRestoreOptions{
		Backup:     backupRestoreRun,
		TargetTime: backupRestoreTargetTime,
	}
}

// confirmPatroniRestore spells out what is about to happen and makes
// the operator type the cluster's name.
//
// A y/n prompt is not enough here. This is the only restore that
// destroys a live database rather than replacing a file or a stream:
// there is no .bak copy to fall back on, and with --target-time it
// discards every transaction committed after the target. Typing the
// name is a deliberate speed bump, and listing the dependent services
// first is there because their failure is the part that surprises
// people — Grafana keeps its own database in patroni_admin, and
// pipelines writes continuously to patroni_metrics.
func confirmPatroniRestore(target, targetTime string, dc *pt.DockerClient, yes bool) error {
	if targetTime != "" {
		fmt.Printf("About to restore %s to %s.\n", target, targetTime)
		fmt.Println("  Every transaction committed AFTER that moment will be discarded.")
	} else {
		fmt.Printf("About to restore %s from its most recent backup.\n", target)
		fmt.Println("  Every transaction committed after that backup will be discarded.")
	}
	fmt.Println("  The cluster's data volumes are cleared and rebuilt. There is no undo.")

	if dependents, err := docker.PatroniDependents(dc, target); err == nil && len(dependents) > 0 {
		fmt.Printf("\n  These running services depend on it and will fail while it rebuilds:\n    %s\n",
			strings.Join(dependents, ", "))
		if target == "patroni_metrics" && slices.Contains(dependents, "pipelines") {
			fmt.Println("    pipelines is ingesting: consider scaling it to 0 first, or it will write")
			fmt.Println("    post-restore data onto a rewound timeline.")
		}
	}

	if yes {
		return nil
	}

	fmt.Printf("\nType %s to confirm: ", target)
	answer, err := promptLine("")
	if err != nil {
		return fmt.Errorf("Cancelled: %v", err)
	}
	if answer != target {
		return fmt.Errorf("Cancelled.")
	}
	return nil
}

// extractTargets lists the targets `backup extract` supports. Only the
// Postgres clusters: it works by replaying WAL to a moment in time,
// which the NATS snapshots and the state file have no equivalent of.
var extractTargets = []string{"patroni_admin", "patroni_metrics"}

var subCmdBackupExtract = &cobra.Command{
	Use:   "extract TARGET",
	Short: "Recover deleted data without touching the live cluster",
	Long: "Restores a backup to a throwaway instance at a point in time, pulls out just the data " +
		"you ask for, and writes it to a file. The live cluster is never stopped or modified.\n\n" +
		"Use this, not 'backup restore', when a table or some rows were deleted by accident: a " +
		"restore rewinds the WHOLE database and discards everything committed since.\n\n" +
		"Nothing is loaded back by default. Read the file, and when it looks right apply it with " +
		"'osi4iot backup apply'. --apply does both in one go, for when you already know what you " +
		"are recovering.\n\n" +
		"EXAMPLES\n\n" +
		"  A whole table, as it was at that moment:\n\n" +
		"    osi4iot backup extract patroni_admin \\\n" +
		"      --target-time '2026-09-13 08:00:00+02' \\\n" +
		"      --table grafanadb.group\n\n" +
		"  Only the rows of one organisation, skipping any that are still there:\n\n" +
		"    osi4iot backup extract patroni_admin \\\n" +
		"      --target-time '2026-09-13 08:00:00+02' \\\n" +
		"      --sql \"SELECT format(\n" +
		"               'INSERT INTO grafanadb.group (id, org_id, team_id, name, acronym) \n" +
		"                VALUES (%s, %s, %s, %L, %L) ON CONFLICT (id) DO NOTHING;',\n" +
		"               id, org_id, team_id, name, acronym)\n" +
		"             FROM grafanadb.group WHERE org_id = 3\"\n\n" +
		"  What --sql is for, and how to write it:\n\n" +
		"  The query runs against the throwaway instance and its output IS the file, so it has " +
		"to emit SQL statements, one per row. format() is the tool: %L quotes and escapes a " +
		"value safely, %s leaves a number bare, %I quotes an identifier.\n\n" +
		"  ON CONFLICT DO NOTHING is what makes the result reloadable into a table that still " +
		"has some of its rows — without it the first surviving row aborts the whole transaction " +
		"and nothing is applied.\n\n" +
		"  When several related tables are involved, emit them parent-first: grafanadb.group " +
		"references org, team and dashboard, so those rows have to exist before its own can go " +
		"in. --table cannot do that ordering, which is the main reason --sql exists.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		target := args[0]
		stdoutLogger := log.New(os.Stdout, "", 0)

		if !slices.Contains(extractTargets, target) {
			exitWithError(fmt.Sprintf("Cannot extract from %q (expected one of: %s)",
				target, strings.Join(extractTargets, ", ")))
			return
		}

		sql := backupExtractSQL
		if backupExtractSQLFile != "" {
			if sql != "" {
				exitWithError("--sql and --sql-file are alternatives: pick one")
				return
			}
			content, err := os.ReadFile(backupExtractSQLFile)
			if err != nil {
				exitWithError(fmt.Sprintf("Error reading %s: %v", backupExtractSQLFile, err))
				return
			}
			sql = string(content)
		}

		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}

		opts := docker.PatroniExtractOptions{
			TargetTime: backupExtractTargetTime,
			Backup:     backupExtractBackup,
			Table:      backupExtractTable,
			SQL:        sql,
			OutputPath: backupExtractOutput,
		}

		switch target {
		case "patroni_admin":
			err = docker.ExtractFromPatroniAdmin(pd, dc, opts, stdoutLogger)
		case "patroni_metrics":
			err = docker.ExtractFromPatroniMetrics(pd, dc, opts, stdoutLogger)
		}
		if err != nil {
			exitWithError(fmt.Sprintf("Error extracting from %s: %v", target, err))
		}

		if !backupExtractApply {
			return
		}

		output := opts.OutputPath
		if output == "" {
			output = "recovered.sql"
		}
		if err := applyRecoveredFile(target, output, pd, dc, stdoutLogger, false); err != nil {
			exitWithError(err.Error())
		}
	},
}

var subCmdBackupApply = &cobra.Command{
	Use:   "apply TARGET",
	Short: "Load a recovered SQL file into the live cluster",
	Long: "Applies a file produced by 'osi4iot backup extract' to the cluster's current primary, " +
		"inside a single transaction: if any statement fails the whole thing is rolled back and " +
		"the database is left untouched.\n\n" +
		"Replication carries the result to the replicas on its own.",
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		target := args[0]
		stdoutLogger := log.New(os.Stdout, "", 0)

		if !slices.Contains(extractTargets, target) {
			exitWithError(fmt.Sprintf("Cannot apply to %q (expected one of: %s)",
				target, strings.Join(extractTargets, ", ")))
			return
		}
		if backupApplyFile == "" {
			exitWithError("--file is required: it is the file 'osi4iot backup extract' produced")
			return
		}

		pd := data.GetData()
		dc, err := docker.GetManagerDC()
		if err != nil {
			exitWithError(fmt.Sprintf("Error getting docker client: %v", err))
		}

		if err := applyRecoveredFile(target, backupApplyFile, pd, dc, stdoutLogger, true); err != nil {
			exitWithError(err.Error())
		}
	},
}

// applyRecoveredFile loads path into target, confirming first.
//
// confirm is false when this follows an extraction in the same command:
// --apply is itself the operator saying yes, and asking twice for one
// decision is how people learn to stop reading prompts.
func applyRecoveredFile(
	target, path string,
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	logger *log.Logger,
	confirm bool,
) error {
	sql, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("Error reading %s: %v", path, err)
	}

	if confirm {
		fmt.Printf("About to apply %s (%d bytes) to %s, on the live cluster.\n", path, len(sql), target)
		fmt.Println("  It runs in one transaction: either all of it lands, or none of it does.")
		fmt.Printf("\nType %s to confirm: ", target)

		answer, err := promptLine("")
		if err != nil {
			return fmt.Errorf("Cancelled: %v", err)
		}
		if answer != target {
			return fmt.Errorf("Cancelled.")
		}
	}

	switch target {
	case "patroni_admin":
		err = docker.ApplyToPatroniAdmin(pd, dc, sql, logger)
	case "patroni_metrics":
		err = docker.ApplyToPatroniMetrics(pd, dc, sql, logger)
	}
	if err != nil {
		return fmt.Errorf("Error applying to %s: %v", target, err)
	}
	return nil
}

func init() {
	subCmdBackupRestore.Flags().BoolP("yes", "y", false, "Skip the confirmation prompt")

	subCmdBackupExtract.Flags().StringVar(&backupExtractTargetTime, "target-time", "",
		"the moment to recover the data from, e.g. '2026-09-11 09:00:00+02' (required)")
	subCmdBackupExtract.Flags().StringVar(&backupExtractBackup, "backup", "",
		"base backup to start from (default: the newest one taken before --target-time)")
	subCmdBackupExtract.Flags().StringVar(&backupExtractTable, "table", "",
		"dump one table's rows, e.g. 'public.my_table'")
	subCmdBackupExtract.Flags().StringVar(&backupExtractSQL, "sql", "",
		"run this statement against the throwaway instance instead of --table; it must emit "+
			"SQL, one statement per row (see the examples in --help)")
	subCmdBackupExtract.Flags().StringVar(&backupExtractSQLFile, "sql-file", "",
		"read the statement for --sql from a file")
	subCmdBackupExtract.Flags().StringVar(&backupExtractOutput, "output", "recovered.sql",
		"where to write the recovered data")
	subCmdBackupExtract.Flags().BoolVar(&backupExtractApply, "apply", false,
		"load the result into the live cluster straight away, without stopping to read it")

	subCmdBackupApply.Flags().StringVar(&backupApplyFile, "file", "",
		"the file produced by 'osi4iot backup extract'")
	subCmdBackupRestore.Flags().StringVar(&backupRestoreTargetTime, "target-time", "",
		"point-in-time recovery target for the patroni targets, e.g. '2026-09-08 14:30:00+00'")
	subCmdBackupRestore.Flags().StringVar(&backupRestoreRun, "run", "",
		"name of the backup to restore, as shown by 'osi4iot backup list' (default: the newest)")

	cmdBackup.AddCommand(subCmdBackupTrigger)
	cmdBackup.AddCommand(subCmdBackupRestore)
	cmdBackup.AddCommand(subCmdBackupList)
	cmdBackup.AddCommand(subCmdBackupExtract)
	cmdBackup.AddCommand(subCmdBackupApply)
	rootCmd.AddCommand(cmdBackup)
}
