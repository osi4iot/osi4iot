package docker

import (
	"encoding/json"
	"fmt"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file backs the `osi4iot backup trigger <target>`,
// `osi4iot backup restore <target>` and `osi4iot backup list <target>`
// commands. Every function here is a
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
	data, err := requestSystemManager(pd, dc, subject, backupTriggerTimeout, nil)
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

// ── List: Postgres (patroni_admin / patroni_metrics) ───────────────────

// backupListTimeout bounds a catalogue lookup. Deliberately longer than
// system_manager's own 60s budget for the sidecar call
// (patroni_backup.listTimeout): a client timeout shorter than the
// server's turns a slow-but-successful lookup into a spurious failure,
// and with requestSystemManager retrying, into three of them.
const backupListTimeout = 90 * time.Second

// PatroniBackup is one entry in a cluster's WAL-G catalogue, mirroring
// system_manager's patroni_backup.BackupInfo.
type PatroniBackup struct {
	Name string `json:"name"`
	Time string `json:"time"`
	// Kind is "full" or "delta".
	Kind string `json:"kind"`
	// ParentName is the backup a delta builds on, empty for a full.
	ParentName string `json:"parent_name"`
	// CompressedSize is the stored size in bytes, 0 if unreported.
	CompressedSize int64 `json:"compressed_size"`
	// PgVersion is the PostgreSQL version that produced it, 0 if
	// unreported.
	PgVersion int `json:"pg_version"`
	// ChainBroken marks a delta whose parent is missing from the
	// catalogue — it cannot be restored from.
	ChainBroken bool `json:"chain_broken"`
	// SystemIdentifier is the PostgreSQL cluster this backup came from.
	// See patroni_restore.go's liveClusterOwnsBackups for what it is
	// used to decide.
	SystemIdentifier uint64 `json:"system_identifier"`
}

// listPatroniFamilyBackups asks system_manager for family's WAL-G
// catalogue, through system_manager.patroni.backup_list.<n>.
//
// Unlike the other backup targets, this is not a listing of S3 objects:
// WAL-G's catalogue is the only thing that knows which stored objects
// form a restorable backup, so system_manager asks wal-g itself via the
// patroni_sidecar sidecar. See system_manager's
// internal/patroni_backup/list.go.
//
// Read-only, so it uses backupListTimeout rather than the two-hour
// backupTriggerTimeout.
func listPatroniFamilyBackups(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily) ([]PatroniBackup, error) {
	subject := "system_manager.patroni.backup_list." + family.SystemManagerName
	data, err := requestSystemManager(pd, dc, subject, backupListTimeout, nil)
	if err != nil {
		return nil, err
	}

	var backups []PatroniBackup
	if err := json.Unmarshal(data, &backups); err != nil {
		return nil, fmt.Errorf("error parsing the backup catalogue: %w", err)
	}
	return backups, nil
}

// ListPatroniAdminBackups returns the patroni_admin cluster's WAL-G
// catalogue, newest first. See listPatroniFamilyBackups.
func ListPatroniAdminBackups(pd *pt.PlatformData, dc *pt.DockerClient) ([]PatroniBackup, error) {
	return listPatroniFamilyBackups(pd, dc, patroniAdminFamily)
}

// ListPatroniMetricsBackups returns the patroni_metrics cluster's WAL-G
// catalogue, newest first. See listPatroniFamilyBackups.
func ListPatroniMetricsBackups(pd *pt.PlatformData, dc *pt.DockerClient) ([]PatroniBackup, error) {
	return listPatroniFamilyBackups(pd, dc, patroniMetricsFamily)
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
	data, err := requestSystemManager(pd, dc, "system_manager.nats_streams.backup", backupTriggerTimeout, nil)
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
	data, err := requestSystemManager(pd, dc, "system_manager.nats_streams.restore", restoreTimeout, nil)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// NatsBackupRun describes one NATS backup run, mirroring
// system_manager's nats_backup.RunInfo.
type NatsBackupRun struct {
	Name    string `json:"name"`
	Streams int    `json:"streams"`
}

// ListNatsBackups returns the backup runs stored in S3, newest first.
//
// It exists because RestoreNatsBackupFromS3 always takes the most
// recent run: without a listing, the operator has no way to tell
// whether that run predates whatever they are recovering from. Listing
// is read-only, so it uses the short timeout the other lookups in this
// package do.
func ListNatsBackups(pd *pt.PlatformData, dc *pt.DockerClient) ([]NatsBackupRun, error) {
	data, err := requestSystemManager(pd, dc, "system_manager.nats_streams.list", backupTriggerTimeout, nil)
	if err != nil {
		return nil, err
	}

	var runs []NatsBackupRun
	if err := json.Unmarshal(data, &runs); err != nil {
		return nil, fmt.Errorf("error parsing the backup run list: %w", err)
	}
	return runs, nil
}

// ── Flush WAL: Postgres (patroni_admin / patroni_metrics) ──────────────

// flushWALTimeout bounds a WAL flush, above system_manager's own 150s
// budget for the same call so the failure surfaces there with
// PostgreSQL's message attached.
const flushWALTimeout = 3 * time.Minute

// flushPatroniFamilyWAL closes the current WAL segment on the cluster's
// primary and waits until the archiver has pushed it, through
// system_manager.patroni.flush_wal.<n>.
//
// The restore flow calls this before destroying anything. With
// archive_timeout at 1800s, up to half an hour of committed
// transactions can exist only in the primary's local pg_wal, and that
// is precisely what a restore throws away. It also turns a broken
// archive_command into a failure BEFORE the volumes are cleared, which
// is the only point at which it can still be acted on.
func flushPatroniFamilyWAL(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily) (string, error) {
	subject := "system_manager.patroni.flush_wal." + family.SystemManagerName
	data, err := requestSystemManager(pd, dc, subject, flushWALTimeout, nil)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// FlushPatroniAdminWAL forces patroni_admin's current WAL segment into
// the archive. See flushPatroniFamilyWAL.
func FlushPatroniAdminWAL(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	return flushPatroniFamilyWAL(pd, dc, patroniAdminFamily)
}

// FlushPatroniMetricsWAL forces patroni_metrics's current WAL segment
// into the archive. See flushPatroniFamilyWAL.
func FlushPatroniMetricsWAL(pd *pt.PlatformData, dc *pt.DockerClient) (string, error) {
	return flushPatroniFamilyWAL(pd, dc, patroniMetricsFamily)
}