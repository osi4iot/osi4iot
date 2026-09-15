package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/docker/docker/client"
)

// This collector answers one question: is WAL recycling blocked?
//
// PostgreSQL cannot reuse a WAL segment until nothing still needs it,
// and two things can hold one back — an archive_command that is failing,
// and a replication slot whose consumer is gone. While either is true,
// pg_wal grows without bound and the database eventually stops. There is
// no setting that prevents this: discarding un-archived WAL would mean
// silently invalidating backups, so PostgreSQL fills the disk instead.
//
// What makes the difference is noticing early. The gap between "the
// archiver started failing" and "the volume is full" is hours or days,
// and failed_count moves at the start of it. volume_metrics already
// shows the disk filling, but only once it is well under way — by then
// the margin is mostly gone.
//
// # One row per cluster, never merged
//
// patroni_admin and patroni_metrics are separate clusters with separate
// archives, and they fail independently: metrics ingests continuously
// and produces far more WAL, so it will usually be the one to break
// first. Averaging them together would hide exactly that. The cluster
// name is part of the row and of the table's primary key.

// walArchiverEndpoints maps each cluster to its patroni_sidecar URL.
//
// Both go through haproxy_patroni, which routes to whichever node is
// currently primary — the only one where pg_current_wal_lsn() works.
// Overridable so a deployment that moves the sidecar does not need a
// rebuilt image.
func walArchiverEndpoints() map[string]string {
	admin := os.Getenv("PATRONI_ADMIN_ARCHIVER_URL")
	if admin == "" {
		admin = "http://haproxy_patroni:5002/archiver_status"
	}
	metrics := os.Getenv("PATRONI_METRICS_ARCHIVER_URL")
	if metrics == "" {
		metrics = "http://haproxy_patroni:5102/archiver_status"
	}
	return map[string]string{"admin": admin, "metrics": metrics}
}

// WalArchiverMetric maps 1-to-1 to the observability.wal_archiver_metrics
// table. One row per cluster per run.
type WalArchiverMetric struct {
	Time    time.Time `json:"time"`
	Cluster string    `json:"cluster"` // admin | metrics

	// ArchiveMode is "on", "always" or "off". Off means nothing is ever
	// archived and no point-in-time recovery exists at all — worth
	// recording rather than assuming.
	ArchiveMode string `json:"archive_mode"`

	// FailedCount is cumulative since the stats were last reset. What
	// matters is whether it MOVES: any increase means archive_command
	// is failing now.
	FailedCount             int64  `json:"failed_count"`
	LastFailedWal           string `json:"last_failed_wal,omitempty"`
	LastArchivedWal         string `json:"last_archived_wal,omitempty"`
	SecondsSinceLastArchive int64  `json:"seconds_since_last_archive"`

	// ReadyFiles is the backlog: segments finished and waiting to be
	// archived. The single clearest number here — it sits at 0 or 1 on
	// a healthy cluster and climbs steadily once archiving breaks.
	ReadyFiles int64 `json:"ready_files"`
	WalFiles   int64 `json:"wal_files"`
	WalBytes   int64 `json:"wal_bytes"`

	// InactiveSlots and SlotRetainedBytes cover the other cause. A slot
	// whose consumer is gone holds WAL just as effectively as a broken
	// archiver, and needs a different fix — dropping the slot, not
	// repairing the archive.
	InactiveSlots     int64 `json:"inactive_slots"`
	SlotRetainedBytes int64 `json:"slot_retained_bytes"`
}

// collectWalArchiver polls both clusters' sidecars and emits one row per
// cluster.
//
// Only the Swarm leader emits. Vector runs on every node, so without
// this guard a three-manager cluster would write three identical rows
// every interval and collide on the table's primary key. Same reasoning
// and same check as collectHostState.
func collectWalArchiver(pretty bool) error {
	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return fmt.Errorf("could not connect to Docker daemon: %w", err)
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	info, err := cli.Info(ctx)
	if err != nil {
		return fmt.Errorf("error querying Docker info: %w", err)
	}
	if info.Swarm.NodeID == "" || !info.Swarm.ControlAvailable {
		fmt.Fprintf(os.Stderr,
			"[wal_archiver] skipping: node %s is not a Swarm manager\n", info.Name)
		return nil
	}
	node, _, err := cli.NodeInspectWithRaw(ctx, info.Swarm.NodeID)
	if err != nil {
		return fmt.Errorf("NodeInspect(%s): %w", info.Name, err)
	}
	if node.ManagerStatus == nil || !node.ManagerStatus.Leader {
		fmt.Fprintf(os.Stderr,
			"[wal_archiver] skipping: node %s is not the Swarm leader\n", info.Name)
		return nil
	}

	now := time.Now().UTC()
	enc := json.NewEncoder(os.Stdout)
	if pretty {
		enc.SetIndent("", "  ")
	}

	for cluster, endpoint := range walArchiverEndpoints() {
		metric, err := fetchArchiverStatus(ctx, endpoint)
		if err != nil {
			// One cluster being unreachable must not silence the other.
			// A cluster with no primary is itself a problem, but it is
			// one the patroni collectors and host_node_state already
			// surface; swallowing the healthy cluster's row here would
			// hide a second, independent failure.
			fmt.Fprintf(os.Stderr, "[wal_archiver] %s: %v\n", cluster, err)
			continue
		}
		metric.Time = now
		metric.Cluster = cluster

		if err := enc.Encode(metric); err != nil {
			return fmt.Errorf("error encoding %s metric: %w", cluster, err)
		}
	}
	return nil
}

// fetchArchiverStatus reads one cluster's status from its sidecar.
func fetchArchiverStatus(ctx context.Context, endpoint string) (*WalArchiverMetric, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	if token := os.Getenv("PATRONI_SIDECAR_API_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling %s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusServiceUnavailable {
		return nil, fmt.Errorf("no primary available (haproxy returned 503)")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s returned %s", endpoint, resp.Status)
	}

	var metric WalArchiverMetric
	if err := json.NewDecoder(resp.Body).Decode(&metric); err != nil {
		return nil, fmt.Errorf("parsing the response: %w", err)
	}
	return &metric, nil
}