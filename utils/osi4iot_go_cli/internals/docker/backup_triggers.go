package docker

import (
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file backs the `osi4iot backup trigger <target>` and
// `osi4iot backup restore <target>` commands. Every function here is a
// thin wrapper around requestSystemManager (patroni_scale.go) — same
// NATS request/reply mechanism already used by queryPatroniLeader /
// switchoverToNode1 / resetNode1Raft during a scale-down, just against
// different subjects. None of these do any work themselves: the actual
// backup/restore logic runs inside system_manager (see
// system_manager/internal/backup and system_manager/internal/natsbackup)
// — this is purely the CLI-side trigger.

// backupTriggerTimeout bounds a backup-trigger request end to end. Both
// Postgres (patroni_sidecar's wal-g backup-push + retention) and NATS
// (JetStream snapshot + S3 upload + retention) can legitimately run
// long on a large dataset, so this matches system_manager's own
// generous internal budgets (backup.triggerTimeout, patroni_sidecar's
// walgTimeout) rather than the short natsQueryTimeout used for
// read-only lookups elsewhere in this package.
const backupTriggerTimeout = 2 * time.Hour

// restoreTimeout bounds a restore request end to end — download from
// S3, extract, delete existing streams, restore, and widen to the
// cluster's current replica count (see system_manager's
// internal/natsbackup.Restore). Same order of magnitude as
// backupTriggerTimeout for the same reason: this can legitimately take
// a while on a large dataset, and the caller should wait for the real
// outcome rather than time out on a restore that's still working.
const restoreTimeout = 2 * time.Hour

// ── Trigger: Postgres (patroni_admin / patroni_metrics) ────────────────

// triggerPatroniFamilyBackup asks system_manager to run backup-push
// (then prune to its configured retention) for family, right now,
// through the same system_manager.patroni.trigger_backup.<n> subject
// backup.Target already exposes on its own daily schedule (see
// system_manager/internal/backup). Blocks until system_manager reports
// the outcome.
func triggerPatroniFamilyBackup(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily) (string, error) {
	subject := "system_manager.patroni.trigger_backup." + family.SystemManagerName
	data, err := requestSystemManager(pd, dc, subject, backupTriggerTimeout)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// TriggerPatroniAdminBackup triggers an on-demand backup of the
// patroni_admin cluster. See triggerPatroniFamilyBackup.
func TriggerPatroniAdminBackup(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	return triggerPatroniFamilyBackup(pd, dc, patroniAdminFamily)
}

// TriggerPatroniMetricsBackup triggers an on-demand backup of the
// patroni_metrics cluster. See triggerPatroniFamilyBackup.
func TriggerPatroniMetricsBackup(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	return triggerPatroniFamilyBackup(pd, dc, patroniMetricsFamily)
}

// ── Trigger + restore: NATS ─────────────────────────────────────────────

// TriggerNatsBackup asks system_manager to snapshot every JetStream
// stream and upload the run to S3, right now, through
// system_manager.nats.backup — replacing this CLI's old
// backupNatsStreams-to-local-directory path for the manual/periodic
// disaster-recovery backup (see nats_backup_restore.go's package doc
// comment; the scale up/down flow's own internal use of
// backupNatsStreams in services.go is unrelated and unchanged — that
// one stays local by design, see its doc comment). Blocks until
// system_manager reports the outcome.
func TriggerNatsBackup(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	data, err := requestSystemManager(pd, dc, "system_manager.nats_streams.backup", backupTriggerTimeout)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// RestoreNatsBackupFromS3 asks system_manager to restore every stream
// from the most recent S3 backup run, through system_manager.nats_streams.restore.
// Deliberately parameter-free on the CLI side too, mirroring
// system_manager's own natsbackup.Restore (see that package's doc
// comment): it always restores the latest run, deletes any existing
// same-named streams first, and widens to the cluster's current replica
// count. The caller (subCmdBackupRestore) is responsible for confirming
// with the operator before calling this — restoring deletes existing
// streams first, and that step is irreversible.
func RestoreNatsBackupFromS3(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	data, err := requestSystemManager(pd, dc, "system_manager.nats_streams.restore", restoreTimeout)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
