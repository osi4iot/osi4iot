package docker

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/nats-io/jsm.go"
	"github.com/nats-io/nats.go/jetstream"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// natsBackupBaseDir returns the base directory for JetStream stream
// snapshots on the manager host (where this CLI runs). Each scale operation
// creates a timestamped subdirectory under it.
//
// It lives under the current user's home directory because this CLI runs as
// an unprivileged user, not root, so paths like /var/lib are not writable.
// The backup is intentionally NOT deleted automatically: it is the safety
// copy of your JetStream data across the standalone<->cluster rebuild, so
// keep it until you have confirmed the target topology holds the expected
// data. It must be a stable local path, not a NATS volume — the whole point
// is that it survives the NATS containers being rebuilt.
func natsBackupBaseDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("error determining home directory for NATS backups: %w", err)
	}
	return filepath.Join(home, ".osi4iot", "nats_backups"), nil
}

// backupNatsStreams connects to nats1 and writes a full snapshot
// (configuration + message data + consumer state) of every JetStream stream
// in the APP account to a fresh timestamped directory on the local manager
// filesystem. It returns the directory and the list of stream names backed
// up (both empty if there were no streams).
//
// Why this exists: NATS has no in-place migration between standalone and
// clustered JetStream. The meta-cluster does not adopt streams created in
// standalone mode, and treats them as orphaned (purging them within seconds
// of the cluster forming) — which is exactly what caused the intermittent
// KV data loss on scale-up. The only reliable way to cross that boundary is
// to snapshot here, rebuild NATS empty into the target topology, and restore
// (see restoreNatsStreams). The snapshot lives on the manager host, decoupled
// from the NATS containers/volumes, so it survives the rebuild.
func backupNatsStreams(pd *pt.PlatformData, dc *pt.DockerClient) (string, []string, error) {
	nodeIP, err := getNats1NodeIP(dc)
	if err != nil {
		return "", nil, fmt.Errorf("error getting nats1 node IP: %w", err)
	}

	nc, err := connectDeployCliToNats(pd, nodeIP)
	if err != nil {
		return "", nil, err
	}
	defer nc.Drain()

	mgr, err := jsm.New(nc)
	if err != nil {
		return "", nil, fmt.Errorf("error creating JetStream manager: %w", err)
	}

	streams, _, _, err := mgr.Streams(nil)
	if err != nil {
		return "", nil, fmt.Errorf("error listing streams to back up: %w", err)
	}
	if len(streams) == 0 {
		return "", nil, nil
	}

	base, err := natsBackupBaseDir()
	if err != nil {
		return "", nil, err
	}
	backupDir := filepath.Join(base, time.Now().UTC().Format("20060102T150405Z"))
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		return "", nil, fmt.Errorf("error creating backup directory %s: %w", backupDir, err)
	}

	var names []string
	for _, s := range streams {
		name := s.Name()
		streamDir := filepath.Join(backupDir, name)
		if err := os.MkdirAll(streamDir, 0o700); err != nil {
			return backupDir, names, fmt.Errorf("error creating backup dir for stream %s: %w", name, err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		_, err := s.SnapshotToDirectory(ctx, streamDir, jsm.SnapshotConsumers())
		cancel()
		if err != nil {
			return backupDir, names, fmt.Errorf("error snapshotting stream %s to %s: %w", name, streamDir, err)
		}
		names = append(names, name)
	}

	fmt.Printf("Backed up %d NATS stream(s) to %s:\n", len(names), backupDir)
	for _, name := range names {
		fmt.Printf("  - %s\n", name)
	}

	return backupDir, names, nil
}

// deleteNatsStreams removes the named streams from NATS. It is called right
// after a confirmed backup so the source is left empty and the cluster can
// be rebuilt from a clean slate.
//
// Deleting up front is deterministic: a standalone stream left on disk while
// NATS becomes clustered is flagged as orphaned by the new meta-cluster and
// purged on its own schedule, which races the restore. Removing it
// explicitly removes that race. The data is safe in the backup taken
// immediately before this call.
func deleteNatsStreams(pd *pt.PlatformData, dc *pt.DockerClient, names []string) error {
	if len(names) == 0 {
		return nil
	}

	nodeIP, err := getNats1NodeIP(dc)
	if err != nil {
		return fmt.Errorf("error getting nats1 node IP: %w", err)
	}

	nc, err := connectDeployCliToNats(pd, nodeIP)
	if err != nil {
		return err
	}
	defer nc.Drain()

	js, err := jetstream.New(nc)
	if err != nil {
		return fmt.Errorf("error getting JetStream context: %w", err)
	}

	for _, name := range names {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		err := js.DeleteStream(ctx, name)
		cancel()
		if err != nil && !errors.Is(err, jetstream.ErrStreamNotFound) {
			return fmt.Errorf("error deleting stream %s: %w", name, err)
		}
	}

	return nil
}

// restoreNatsStreams restores every stream snapshot under backupDir back into
// NATS and then raises each restored stream to targetReplicas.
//
// It returns (warning, error). A non-empty warning means everything was
// restored and full replication was requested, but one or more streams had not
// finished syncing to targetReplicas when we stopped waiting — a degraded but
// functional state (the data is in the cluster, served at least at R1, and the
// followers keep catching up on their own). The caller should surface the
// warning and let the rest of the scale operation complete. A non-nil error is
// reserved for failures that actually left data out of the cluster (a snapshot
// that could not be restored), which warrant aborting.
//
// This is the second half of the standalone->cluster transition: NATS has been
// rebuilt empty into the target topology, so each stream is recreated from its
// snapshot (data + consumer state) and then, if targetReplicas > 1, widened
// within the already-formed cluster. Streams are restored at the snapshot's
// replica count (R1) first and widened as a separate, observable step.
func restoreNatsStreams(pd *pt.PlatformData, dc *pt.DockerClient, backupDir string, names []string, targetReplicas int) (string, error) {
	if backupDir == "" || len(names) == 0 {
		return "", nil
	}

	nodeIP, err := getNats1NodeIP(dc)
	if err != nil {
		return "", fmt.Errorf("error getting nats1 node IP: %w", err)
	}

	nc, err := connectDeployCliToNats(pd, nodeIP)
	if err != nil {
		return "", err
	}
	defer nc.Drain()

	mgr, err := jsm.New(nc)
	if err != nil {
		return "", fmt.Errorf("error creating JetStream manager: %w", err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		return "", fmt.Errorf("error getting JetStream context: %w", err)
	}

	// Phase 1: restore every stream's data into the cluster (at the
	// snapshot's replica count, R1). Restore ALL of them before widening
	// any, so a later widen stall doesn't leave some streams unrestored —
	// their data would then exist only in the backup. (This is what bit us
	// before: widening was interleaved per stream, so a stall on the first
	// stream aborted the loop and the remaining streams were never restored.)
	// A restore failure here is a hard error: that stream's data did not make
	// it into the cluster (it is still in the backup) and the operator must
	// intervene.
	var restored []string
	for _, name := range names {
		streamDir := filepath.Join(backupDir, name)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		_, _, err := mgr.RestoreSnapshotFromDirectory(ctx, name, streamDir)
		cancel()
		if err != nil {
			return "", fmt.Errorf("error restoring stream %s from %s: %w", name, streamDir, err)
		}
		restored = append(restored, name)
	}

	fmt.Printf("Restored %d NATS stream(s) into the cluster:\n", len(restored))
	for _, name := range restored {
		fmt.Printf("  - %s\n", name)
	}

	if targetReplicas <= 1 {
		return "", nil
	}

	// Phase 2: raise every restored stream to targetReplicas and wait for it
	// to fully sync, all concurrently. The data is already safely in the
	// cluster at this point, so a stream that does not reach full replication
	// in time is reported as a WARNING, not a hard error: the cluster is up,
	// the data is present, and the followers keep catching up on their own
	// once whatever was blocking replication is resolved. Running the waits
	// concurrently bounds the total time by the slowest stream rather than the
	// sum of all of them.
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
			results <- syncResult{name, waitForStreamFullySynced(js, name, targetReplicas, 120*time.Second)}
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
	if len(lagged) > 0 {
		// No "Warning:" prefix and no trailing newline: the caller already
		// renders these under a "Warnings:" heading. Keep it to a short
		// summary plus the affected stream names rather than repeating the
		// same per-stream timeout text for each one.
		return fmt.Sprintf(
			"%d of %d restored NATS stream(s) have not reached %d replicas yet. Their data is "+
				"restored and the cluster is up, but full replication is still pending; they will "+
				"keep catching up on their own once the underlying replication issue is resolved.\n"+
				"Pending: %s",
			len(lagged), len(restored), targetReplicas, strings.Join(lagged, ", ")), nil
	}

	return "", nil
}

// setStreamReplicas raises a single stream's Replicas to targetReplicas,
// preserving the rest of its just-restored configuration. The UpdateStream
// call being accepted only means the meta-cluster recorded the new replica
// count; use waitForStreamFullySynced afterwards to confirm the peers
// actually caught up.
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

// waitForStreamFullySynced waits until streamName has an elected leader, at
// least targetReplicas members, and every replica peer reports current==true
// (i.e. caught up).
//
// It asks via the JetStream API (Stream.Info) rather than scraping a fixed
// node's /jsz, and this distinction matters: the per-replica "current" flag is
// only authoritative on the stream's LEADER, because in RAFT only the leader
// receives each follower's append-entries responses and therefore only the
// leader knows which followers are caught up. The JetStream API request is
// served by the stream's leader, so info.Cluster.Replicas[].Current is the
// real status of every follower.
//
// The earlier version polled nats1's monitoring endpoint directly. For any
// stream nats1 did not lead, nats1 cannot know the status of the OTHER
// follower and reports it as current:false / active:0 - which looks exactly
// like a stuck replica but is only nats1's lack of information. That false
// negative is what made this function time out (and the scale-up "warn") on
// streams that were in fact fully replicated.
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
			// info.Cluster.Replicas lists the peers other than the leader, so
			// the full member count is those replicas plus the leader itself.
			members := 1 + len(info.Cluster.Replicas)
			notCurrent := 0
			for _, r := range info.Cluster.Replicas {
				if !r.Current || r.Offline {
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
 
// NatsStreamInfo is a compact, display-oriented view of a single JetStream
// stream, decoupling the CLI from the underlying NATS API types.
type NatsStreamInfo struct {
	Name       string
	Replicas   int    // configured replica count
	Leader     string // current leader server name ("" if none/standalone)
	Messages   uint64
	Bytes      uint64
	Peers      int  // total members (leader + replicas)
	AllCurrent bool // every non-leader peer is caught up
}
 
// ListNatsStreams returns the streams currently present in NATS, with
// authoritative per-stream cluster status. Each stream's Information() request
// is answered by that stream's leader, so Leader/AllCurrent reflect the real
// state rather than the view of whichever node we happen to be connected to.
func ListNatsStreams(pd *pt.PlatformData, dc *pt.DockerClient) ([]NatsStreamInfo, error) {
	nodeIP, err := getNats1NodeIP(dc)
	if err != nil {
		return nil, fmt.Errorf("error getting nats1 node IP: %w", err)
	}
 
	nc, err := connectDeployCliToNats(pd, nodeIP)
	if err != nil {
		return nil, err
	}
	defer nc.Drain()
 
	mgr, err := jsm.New(nc)
	if err != nil {
		return nil, fmt.Errorf("error creating JetStream manager: %w", err)
	}
 
	streams, _, _, err := mgr.Streams(nil)
	if err != nil {
		return nil, fmt.Errorf("error listing streams: %w", err)
	}
 
	out := make([]NatsStreamInfo, 0, len(streams))
	for _, s := range streams {
		nfo, err := s.Information()
		if err != nil {
			replicas := s.Configuration().Replicas
			if replicas < 1 {
				replicas = 1
			}
			out = append(out, NatsStreamInfo{Name: s.Name(), Replicas: replicas})
			continue
		}
 
		replicas := nfo.Config.Replicas
		if replicas < 1 {
			replicas = 1
		}
 
		si := NatsStreamInfo{
			Name:       nfo.Config.Name,
			Replicas:   replicas,
			Messages:   nfo.State.Msgs,
			Bytes:      nfo.State.Bytes,
			Peers:      1,
			AllCurrent: true,
		}
		if nfo.Cluster != nil {
			si.Leader = nfo.Cluster.Leader
			si.Peers = 1 + len(nfo.Cluster.Replicas)
			if si.Leader == "" {
				si.AllCurrent = false
			}
			for _, p := range nfo.Cluster.Replicas {
				if !p.Current || p.Offline {
					si.AllCurrent = false
				}
			}
		}
		out = append(out, si)
	}
 
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}
 
// deleteNatsBackup removes a single backup directory
func deleteNatsBackup(natsBackupDir string) error {
	// Reject anything that is not a plain directory name, to prevent escaping
	// the backups base directory (e.g. "..", "a/b", absolute paths).
	if natsBackupDir == "" || natsBackupDir == "." || natsBackupDir == ".." {
		return  fmt.Errorf("invalid backup name %q", natsBackupDir)
	}
 
	info, err := os.Stat(natsBackupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("backup %q not found", natsBackupDir)
		}
		return fmt.Errorf("error accessing backup %q: %w", natsBackupDir, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%q is not a backup directory", natsBackupDir)
	}
 
	if err := os.RemoveAll(natsBackupDir); err != nil {
		return fmt.Errorf("error deleting backup %q: %w", natsBackupDir, err)
	}
	return nil
}
