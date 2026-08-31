package nats_backup

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/jsm.go"
	"github.com/nats-io/nats.go/jetstream"

	"system_manager/internal/task"
)

// restoreSnapshotTimeout bounds a single stream's
// RestoreSnapshotFromDirectory call — matches the platform CLI's own
// restoreNatsStreams (nats_backup_restore.go).
const restoreSnapshotTimeout = 10 * time.Minute

// widenTimeout bounds how long Run waits for a single restored stream to
// reach targetReplicas after being widened. Matches the platform CLI's
// own waitForStreamFullySynced call site in restoreNatsStreams.
const widenTimeout = 120 * time.Second

// Restore restores every stream from the MOST RECENT run in S3 into the
// running NATS cluster, deleting any existing same-named streams first,
// and raises each restored stream to the cluster's current replica
// count. On-demand only (does not implement task.Scheduled) — see the
// package doc comment for why this is deliberately not parameterized
// (always latest run, always delete-existing, always current cluster
// size).
type Restore struct {
	cfg Config
}

var _ task.Task = Restore{}

// NewRestore builds the Restore task from cfg. Wrap the result with
// task.Serialize before handing it to natssvc.Run — see main.go.
func NewRestore(cfg Config) Restore { return Restore{cfg: cfg} }

// Subject identifies this task for NATS routing and logging as
// "nats_streams.restore" — "system_manager.nats_streams.restore" once natssvc nests it,
// alongside "nats_streams.backup".
func (r Restore) Subject() string { return "nats_streams.restore" }

// Run downloads the most recent S3 run, restores every stream it
// contains (deleting any existing same-named stream first), widens each
// restored stream to the cluster's current replica count, and reports
// the outcome. Satisfies task.Task. params is unused — see this type's
// doc comment for why which run/replica-count/delete-first are
// deliberately not caller-supplied parameters.
func (r Restore) Run(ctx context.Context, params map[string]any) (string, error) {
	s3c, err := newS3Client(ctx, r.cfg)
	if err != nil {
		return "", err
	}

	runs, err := listRuns(ctx, s3c)
	if err != nil {
		return "", err
	}
	if len(runs) == 0 {
		return "", fmt.Errorf("no NATS backup runs found under s3://%s/%s", r.cfg.s3Bucket, r.cfg.s3Prefix)
	}
	run := runs[len(runs)-1] // listRuns sorts oldest first; the last is most recent

	keys, err := listRunObjects(ctx, s3c, run)
	if err != nil {
		return "", err
	}
	if len(keys) == 0 {
		return "", fmt.Errorf("run %s has no objects", run)
	}

	tmpDir, err := os.MkdirTemp("", "nats-restore-")
	if err != nil {
		return "", fmt.Errorf("creating temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	nc, err := connect(r.cfg)
	if err != nil {
		return "", err
	}
	defer nc.Drain()

	mgr, err := jsm.New(nc)
	if err != nil {
		return "", fmt.Errorf("creating JetStream manager: %w", err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		return "", fmt.Errorf("getting JetStream context: %w", err)
	}

	targetReplicas := currentNatsReplicas(nc)

	var restored []string
	for _, key := range keys {
		if !strings.HasSuffix(key, ".tar.gz") {
			continue
		}
		name := strings.TrimSuffix(filepath.Base(key), ".tar.gz")

		archivePath := filepath.Join(tmpDir, name+".tar.gz")
		if err := s3c.DownloadFile(ctx, key, archivePath); err != nil {
			return "", fmt.Errorf("run %s: %w", run, err)
		}

		streamDir := filepath.Join(tmpDir, name)
		if err := os.MkdirAll(streamDir, 0o700); err != nil {
			return "", fmt.Errorf("%s: creating restore dir: %w", name, err)
		}
		if err := untarGz(archivePath, streamDir); err != nil {
			return "", fmt.Errorf("%s: extracting snapshot: %w", name, err)
		}
		os.Remove(archivePath) // extracted; don't need the archive anymore

		// Delete first: a snapshot restore fails if the stream already
		// exists — same reasoning as the platform CLI's
		// RestoreNatsStreams(..., deleteExisting=true) path
		// (nats_backup_restore.go).
		delCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		delErr := js.DeleteStream(delCtx, name)
		cancel()
		if delErr != nil && !errors.Is(delErr, jetstream.ErrStreamNotFound) {
			return "", fmt.Errorf("%s: deleting existing stream before restore: %w", name, delErr)
		}

		restoreCtx, cancel := context.WithTimeout(ctx, restoreSnapshotTimeout)
		_, _, err = mgr.RestoreSnapshotFromDirectory(restoreCtx, name, streamDir)
		cancel()
		if err != nil {
			return "", fmt.Errorf("%s: restoring: %w", name, err)
		}
		restored = append(restored, name)
		os.RemoveAll(streamDir)
	}

	if len(restored) == 0 {
		return "", fmt.Errorf("run %s had no stream archives to restore", run)
	}

	warning := widenRestoredStreams(js, restored, targetReplicas)

	msg := fmt.Sprintf("Restored %d NATS stream(s) from s3://%s/%s (run %s) at %d replica(s):\n",
		len(restored), r.cfg.s3Bucket, r.cfg.s3Prefix, run, targetReplicas)
	for _, name := range restored {
		msg += fmt.Sprintf("  - %s\n", name)
	}
	if warning != "" {
		msg += "\n" + warning
	}
	return msg, nil
}

// widenRestoredStreams raises every restored stream to targetReplicas
// and waits for it to fully sync, all concurrently — the same shape as
// the platform CLI's own restoreNatsStreams Phase 2 (nats_backup_restore.go),
// adapted here to run inside system_manager instead of the CLI. Returns
// a non-empty warning listing any streams that had not caught up by
// widenTimeout; the data is already safely restored either way (see the
// CLI's own doc comment on this exact trade-off), so a slow widen is
// reported, not treated as a Run failure.
func widenRestoredStreams(js jetstream.JetStream, restored []string, targetReplicas int) string {
	if targetReplicas <= 1 {
		return ""
	}

	type syncResult struct {
		name string
		err  error
	}
	results := make(chan syncResult, len(restored))
	var wg sync.WaitGroup
	for _, name := range restored {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			if err := setStreamReplicas(js, name, targetReplicas); err != nil {
				results <- syncResult{name, fmt.Errorf("could not set replicas: %w", err)}
				return
			}
			results <- syncResult{name, waitForStreamFullySynced(js, name, targetReplicas, widenTimeout)}
		}(name)
	}
	wg.Wait()
	close(results)

	var lagged []string
	for r := range results {
		if r.err != nil {
			lagged = append(lagged, r.name)
		}
	}
	if len(lagged) == 0 {
		return ""
	}
	return fmt.Sprintf(
		"%d of %d restored NATS stream(s) have not reached %d replicas yet. Their data is "+
			"restored and the cluster is up, but full replication is still pending; they will "+
			"keep catching up on their own once the underlying replication issue is resolved.\n"+
			"Pending: %s",
		len(lagged), len(restored), targetReplicas, strings.Join(lagged, ", "))
}

// setStreamReplicas raises a single stream's Replicas to targetReplicas,
// preserving the rest of its just-restored configuration.
func setStreamReplicas(js jetstream.JetStream, name string, targetReplicas int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	s, err := js.Stream(ctx, name)
	if err != nil {
		return fmt.Errorf("error loading stream: %w", err)
	}

	cfg := s.CachedInfo().Config
	cfg.Replicas = targetReplicas
	if _, err := js.UpdateStream(ctx, cfg); err != nil {
		return fmt.Errorf("error updating replicas: %w", err)
	}
	return nil
}

// waitForStreamFullySynced waits until streamName has an elected leader,
// at least targetReplicas members, and every replica peer reports
// current==true. Identical in approach to the platform CLI's own
// waitForStreamFullySynced (nats_backup_restore.go) — see that
// function's doc comment for why this asks the JetStream API (answered
// by the stream's leader) rather than scraping a fixed node's /jsz.
func waitForStreamFullySynced(js jetstream.JetStream, streamName string, targetReplicas int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastSeen string

	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		s, err := js.Stream(ctx, streamName)
		if err != nil {
			cancel()
			lastSeen = fmt.Sprintf("stream lookup error: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}
		info, err := s.Info(ctx)
		cancel()
		if err != nil {
			lastSeen = fmt.Sprintf("stream info error: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}

		if info.Cluster != nil {
			members := 1 + len(info.Cluster.Replicas)
			notCurrent := 0
			for _, rep := range info.Cluster.Replicas {
				if !rep.Current || rep.Offline {
					notCurrent++
				}
			}
			if info.Cluster.Leader != "" && members >= targetReplicas && notCurrent == 0 {
				return nil
			}
			lastSeen = fmt.Sprintf("leader=%q members=%d peers-not-current=%d",
				info.Cluster.Leader, members, notCurrent)
		} else {
			lastSeen = "no cluster info reported"
		}
		time.Sleep(1 * time.Second)
	}

	return fmt.Errorf("stream %s did not fully sync to %d replicas within %s (last observed: %s)",
		streamName, targetReplicas, timeout, lastSeen)
}
