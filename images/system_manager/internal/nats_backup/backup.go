package nats_backup

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/nats-io/jsm.go"

	"system_manager/internal/schedule"
	"system_manager/internal/task"
)

// snapshotTimeout bounds a single stream's SnapshotToDirectory call —
// matches the platform CLI's own backupNatsStreams
// (nats_backup_restore.go), which this replaces for the manual/periodic
// DR-backup use case.
const snapshotTimeout = 5 * time.Minute

// Backup snapshots every JetStream stream (data + consumer state) and
// uploads each one, tarred and gzipped, to a fresh timestamped "run" in
// S3, then prunes old runs down to cfg.retain. Implements
// task.Scheduled, so it's reachable both on its own daily timer (see
// schedule.Loop in main.go) and on demand over NATS (see natssvc.go),
// the same as backup.Target already is for patroni_admin/patroni_metrics.
type Backup struct {
	cfg Config
}

var _ task.Scheduled = Backup{}

// NewBackup builds the Backup task from cfg. Wrap the result with
// task.SerializeScheduled before handing it to schedule.Loop/natssvc.Run
// — see main.go.
func NewBackup(cfg Config) Backup { return Backup{cfg: cfg} }

// Subject identifies this task for NATS routing and logging as
// "nats_streams.backup" — "system_manager.nats_streams.backup" once natssvc nests it,
// its own top-level prefix alongside "patroni." (see
// system_manager/internal/patroni/patroni.go and internal/backup).
func (b Backup) Subject() string { return "nats_streams.backup" }

// NextRun returns the next UTC occurrence of cfg's backup schedule —
// once a day by default, or every cfg.everyHours if configured (see
// schedule.EveryNHoursAt and Config's doc comment).
func (b Backup) NextRun(now time.Time) time.Time {
	return schedule.EveryNHoursAt(now, b.cfg.backupHour, b.cfg.everyHours)
}

// Run snapshots every stream, uploads the run to S3, and applies
// retention. Satisfies task.Task. params is unused — nothing about a
// NATS backup run is caller-configurable beyond cfg's own retention
// policy.
func (b Backup) Run(ctx context.Context, params map[string]any) (string, error) {
	nc, err := connect(b.cfg)
	if err != nil {
		return "", err
	}
	defer nc.Drain()

	mgr, err := jsm.New(nc)
	if err != nil {
		return "", fmt.Errorf("creating JetStream manager: %w", err)
	}

	streams, _, _, err := mgr.Streams(nil)
	if err != nil {
		return "", fmt.Errorf("listing streams: %w", err)
	}
	if len(streams) == 0 {
		return "no NATS streams found; nothing to back up", nil
	}

	s3c, err := newS3Client(ctx, b.cfg)
	if err != nil {
		return "", err
	}

	run := time.Now().UTC().Format("20060102T150405Z")
	tmpDir, err := os.MkdirTemp("", "nats-backup-")
	if err != nil {
		return "", fmt.Errorf("creating temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	var uploaded []string
	for _, s := range streams {
		name := s.Name()

		snapDir := filepath.Join(tmpDir, name)
		if err := os.MkdirAll(snapDir, 0o700); err != nil {
			return "", fmt.Errorf("%s: creating snapshot dir: %w", name, err)
		}

		snapCtx, cancel := context.WithTimeout(ctx, snapshotTimeout)
		_, err := s.SnapshotToDirectory(snapCtx, snapDir, jsm.SnapshotConsumers())
		cancel()
		if err != nil {
			return "", fmt.Errorf("%s: snapshotting: %w", name, err)
		}

		tarPath := filepath.Join(tmpDir, name+".tar.gz")
		if err := tarGzDirectory(snapDir, tarPath); err != nil {
			return "", fmt.Errorf("%s: archiving snapshot: %w", name, err)
		}

		key := s3c.Key(run, name+".tar.gz")
		if err := s3c.UploadFile(ctx, tarPath, key); err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		uploaded = append(uploaded, name)

		// Free disk as we go rather than after the whole run: a
		// platform with many/large streams shouldn't need enough scratch
		// space for every stream's tar.gz at once.
		os.RemoveAll(snapDir)
		os.Remove(tarPath)
	}

	deleted, retainErr := applyRetention(ctx, s3c, b.cfg.retain)
	if retainErr != nil {
		// The backup itself already succeeded and is safe in S3 — a
		// retention hiccup is worth surfacing but shouldn't turn a
		// successful backup into a failed Run, mirroring how
		// patroni_sidecar treats its own retention step (see
		// runDeleteRetain's caller in patroni_sidecar/main.go: "Success
		// is defined by backup-push alone").
		return fmt.Sprintf(
			"Backed up %d NATS stream(s) to s3://%s/%s (run %s); retention cleanup failed: %v",
			len(uploaded), b.cfg.s3Bucket, b.cfg.s3Prefix, run, retainErr), nil
	}

	msg := fmt.Sprintf("Backed up %d NATS stream(s) to s3://%s/%s (run %s):\n",
		len(uploaded), b.cfg.s3Bucket, b.cfg.s3Prefix, run)
	for _, name := range uploaded {
		msg += fmt.Sprintf("  - %s\n", name)
	}
	if len(deleted) > 0 {
		msg += fmt.Sprintf("Pruned %d old run(s): %v\n", len(deleted), deleted)
	}
	return msg, nil
}
