package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// containerStatsWorkers caps the number of concurrent ContainerStats API calls.
// Each call blocks briefly while the daemon samples cgroup counters, so
// parallelism matters on nodes with many containers.
const containerStatsWorkers = 8

// ContainerMetric maps 1-to-1 to the container_metrics TimescaleDB table.
// Fields tagged with json:"-" are omitted intentionally (handled by the
// PRIMARY KEY or inferred by the Vector pipeline).
type ContainerMetric struct {
	// Timescale primary key component
	Time time.Time `json:"time"`

	// Docker / Swarm identity
	ContainerID   string `json:"container_id"`
	ContainerName string `json:"container_name"`
	Image         string `json:"image"`

	// Node identity — populated from the Docker daemon Info response so that
	// the value is consistent whether this runs in Swarm or standalone mode.
	NodeID   string `json:"node_id"`
	NodeName string `json:"node_name"`

	// Swarm service identity (empty for non-Swarm containers)
	Stack       string `json:"stack"`
	Service     string `json:"service"`
	TaskID      string `json:"task_id"`
	TaskName    string `json:"task_name"`
	ReplicaSlot *int   `json:"replica_slot,omitempty"`

	// Container state
	State        string `json:"state"`
	Status       string `json:"status"`
	RestartCount int    `json:"restart_count"`
	Pids         uint64 `json:"pids"`

	// CPU — usage is calculated from the delta between the current and previous
	// CPU snapshots that Docker provides in a single stats call, matching the
	// formula used by `docker stats` and cAdvisor:
	//   percent = (cpuDelta / systemDelta) × numCPUs × 100
	CPUCores              float64 `json:"cpu_cores"`
	CPUUsagePercent       float64 `json:"cpu_usage_percent"`
	CPULimitCores         float64 `json:"cpu_limit_cores"` // 0 = unlimited
	CPUThrottledPeriods   uint64  `json:"cpu_throttled_periods_total"`
	CPUThrottledTimeNanos uint64  `json:"cpu_throttled_time_nanoseconds_total"`

	// Memory — Usage includes page cache. CacheBytes and RSSBytes are extracted
	// from the cgroup stats map and support both cgroups v1 and v2 layouts.
	MemoryUsageBytes      uint64  `json:"memory_usage_bytes"`
	MemoryWorkingSetBytes uint64  `json:"memory_working_set_bytes"` // usage minus cache
	MemoryLimitBytes      uint64  `json:"memory_limit_bytes"`       // 0 = unlimited
	MemoryCacheBytes      uint64  `json:"memory_cache_bytes"`
	MemoryRSSBytes        uint64  `json:"memory_rss_bytes"`
	MemoryUsagePercent    float64 `json:"memory_usage_percent"`

	// Network — aggregated across all virtual interfaces attached to the
	// container. Per-interface breakdown is in the network collector.
	NetworkRxBytesTotal   uint64 `json:"network_rx_bytes_total"`
	NetworkTxBytesTotal   uint64 `json:"network_tx_bytes_total"`
	NetworkRxPacketsTotal uint64 `json:"network_rx_packets_total"`
	NetworkTxPacketsTotal uint64 `json:"network_tx_packets_total"`
	NetworkRxErrorsTotal  uint64 `json:"network_rx_errors_total"`
	NetworkTxErrorsTotal  uint64 `json:"network_tx_errors_total"`

	// Block I/O
	BlockReadBytesTotal  uint64 `json:"block_read_bytes_total"`
	BlockWriteBytesTotal uint64 `json:"block_write_bytes_total"`
	BlockReadOpsTotal    uint64 `json:"block_read_ops_total"`
	BlockWriteOpsTotal   uint64 `json:"block_write_ops_total"`
}

// collectContainers lists all running containers, fetches one-shot resource
// stats for each in parallel, and writes one ContainerMetric JSON object per
// container to stdout.
func collectContainers(pretty bool) error {
	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return fmt.Errorf("could not connect to Docker daemon: %w", err)
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Docker daemon Info gives us the Swarm node identity without an extra
	// API call per container.
	info, err := cli.Info(ctx)
	if err != nil {
		return fmt.Errorf("error querying Docker info: %w", err)
	}
	nodeID := info.Swarm.NodeID // empty on standalone daemons
	nodeName := info.Name       // matches the node hostname shown in `docker node ls`

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: false})
	if err != nil {
		return fmt.Errorf("error listing containers: %w", err)
	}
	if len(containers) == 0 {
		return nil
	}

	// Capture a single timestamp for the entire collection run so that all
	// rows in this batch share the same time value — important for time-series
	// queries that JOIN across metrics.
	now := time.Now().UTC()

	type result struct {
		metric *ContainerMetric
		err    error
	}

	sem := make(chan struct{}, containerStatsWorkers)
	results := make(chan result, len(containers))
	var wg sync.WaitGroup

	for _, c := range containers {
		wg.Add(1)
		c := c // capture loop variable for the goroutine
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			m, err := buildContainerMetric(ctx, cli, c, nodeID, nodeName, now)
			results <- result{m, err}
		}()
	}

	// Close results channel once all goroutines have finished so the range
	// loop below terminates naturally.
	go func() {
		wg.Wait()
		close(results)
	}()

	enc := json.NewEncoder(os.Stdout)
	if pretty {
		enc.SetIndent("", "  ")
	}

	for r := range results {
		if r.err != nil {
			// Log but continue — a single container failing (e.g. it exited
			// between list and stats) should not abort the whole collection.
			fmt.Fprintf(os.Stderr, "[containers] %v\n", r.err)
			continue
		}
		if err := enc.Encode(r.metric); err != nil {
			return fmt.Errorf("error writing container metric: %w", err)
		}
	}

	return nil
}

// buildContainerMetric performs a ContainerStats + ContainerInspect call for
// the given container and assembles a ContainerMetric ready for serialisation.
func buildContainerMetric(
	ctx context.Context,
	cli *client.Client,
	c container.Summary,
	nodeID, nodeName string,
	now time.Time,
) (*ContainerMetric, error) {
	// One-shot stats (stream=false): Docker returns the current cgroup counters
	// plus the previous snapshot so we can compute deltas in a single call.
	statsResp, err := cli.ContainerStats(ctx, c.ID, false)
	if err != nil {
		return nil, fmt.Errorf("ContainerStats(%s): %w", c.ID[:12], err)
	}
	defer statsResp.Body.Close()

	var stats container.StatsResponse
	if err := json.NewDecoder(statsResp.Body).Decode(&stats); err != nil {
		return nil, fmt.Errorf("decode stats(%s): %w", c.ID[:12], err)
	}

	// Inspect gives us restart count and resource limits (NanoCpus, Memory).
	inspect, err := cli.ContainerInspect(ctx, c.ID)
	if err != nil {
		return nil, fmt.Errorf("ContainerInspect(%s): %w", c.ID[:12], err)
	}

	// Container name — Docker always prefixes names with '/'.
	name := ""
	if len(c.Names) > 0 {
		name = strings.TrimPrefix(c.Names[0], "/")
	}

	// Swarm identity is stored in well-known Docker labels.
	labels := c.Labels
	app := labelOrDefault(labels, "app", "unknown")
	stack := labelOrDefault(labels, "com.docker.stack.namespace", app)
	service := labelOrDefault(labels, "com.docker.swarm.service.name", "")
	taskID := labelOrDefault(labels, "com.docker.swarm.task.id", "")
	taskName := labelOrDefault(labels, "com.docker.swarm.task.name", "")
	replicaSlot := parseReplicaSlot(taskName)

	// ── CPU ──────────────────────────────────────────────────────────────────
	cpuPercent, numCPUs := calcCPUPercent(&stats)

	cpuLimitCores := 0.0
	if inspect.HostConfig != nil && inspect.HostConfig.NanoCPUs > 0 {
		cpuLimitCores = float64(inspect.HostConfig.NanoCPUs) / 1e9
	}
	throttled := stats.CPUStats.ThrottlingData

	// ── Memory ───────────────────────────────────────────────────────────────
	memUsage := stats.MemoryStats.Usage
	memLimit := stats.MemoryStats.Limit
	// cgroups v1 keys: "cache", "rss"
	// cgroups v2 keys: "inactive_file" (page cache), "anon" (anonymous RSS)
	memCache := cgroupStatValue(stats.MemoryStats.Stats, "cache", "inactive_file")
	memRSS := cgroupStatValue(stats.MemoryStats.Stats, "rss", "anon")
	memWorkingSet := memUsage
	if memCache < memWorkingSet {
		memWorkingSet = memUsage - memCache
	}

	memPercent := 0.0
	if memLimit > 0 {
		memPercent = math.Round(float64(memWorkingSet)/float64(memLimit)*10000) / 100
	}

	// ── Network ──────────────────────────────────────────────────────────────
	var netRxBytes, netTxBytes, netRxPkts, netTxPkts, netRxErr, netTxErr uint64
	for _, n := range stats.Networks {
		netRxBytes += n.RxBytes
		netTxBytes += n.TxBytes
		netRxPkts += n.RxPackets
		netTxPkts += n.TxPackets
		netRxErr += n.RxErrors
		netTxErr += n.TxErrors
	}

	// ── Block I/O ─────────────────────────────────────────────────────────────
	var blkReadBytes, blkWriteBytes, blkReadOps, blkWriteOps uint64
	for _, bio := range stats.BlkioStats.IoServiceBytesRecursive {
		switch strings.ToLower(bio.Op) {
		case "read":
			blkReadBytes += bio.Value
		case "write":
			blkWriteBytes += bio.Value
		}
	}
	for _, bio := range stats.BlkioStats.IoServicedRecursive {
		switch strings.ToLower(bio.Op) {
		case "read":
			blkReadOps += bio.Value
		case "write":
			blkWriteOps += bio.Value
		}
	}

	return &ContainerMetric{
		Time:          now,
		ContainerID:   c.ID,
		ContainerName: name,
		Image:         c.Image,
		NodeID:        nodeID,
		NodeName:      nodeName,
		Stack:         stack,
		Service:       service,
		TaskID:        taskID,
		TaskName:      taskName,
		ReplicaSlot:   replicaSlot,
		State:         c.State,
		Status:        c.Status,
		RestartCount:  inspect.RestartCount,
		Pids:          stats.PidsStats.Current,

		CPUCores:              float64(numCPUs),
		CPUUsagePercent:       cpuPercent,
		CPULimitCores:         cpuLimitCores,
		CPUThrottledPeriods:   throttled.ThrottledPeriods,
		CPUThrottledTimeNanos: throttled.ThrottledTime,

		MemoryUsageBytes:      memUsage,
		MemoryWorkingSetBytes: memWorkingSet,
		MemoryLimitBytes:      memLimit,
		MemoryCacheBytes:      memCache,
		MemoryRSSBytes:        memRSS,
		MemoryUsagePercent:    memPercent,

		NetworkRxBytesTotal:   netRxBytes,
		NetworkTxBytesTotal:   netTxBytes,
		NetworkRxPacketsTotal: netRxPkts,
		NetworkTxPacketsTotal: netTxPkts,
		NetworkRxErrorsTotal:  netRxErr,
		NetworkTxErrorsTotal:  netTxErr,

		BlockReadBytesTotal:  blkReadBytes,
		BlockWriteBytesTotal: blkWriteBytes,
		BlockReadOpsTotal:    blkReadOps,
		BlockWriteOpsTotal:   blkWriteOps,
	}, nil
}

// calcCPUPercent returns CPU usage as a percentage of total host capacity and
// the number of online CPUs, using the delta between the current and previous
// CPU snapshots included in a single Docker stats response.
//
// Formula (matches `docker stats` and cAdvisor):
//
//	percent = (ΔcpuUsage / ΔsystemUsage) × onlineCPUs × 100
func calcCPUPercent(s *container.StatsResponse) (percent float64, numCPUs uint32) {
	numCPUs = s.CPUStats.OnlineCPUs
	if numCPUs == 0 {
		// Older API versions omit OnlineCPUs; fall back to per-cpu array length.
		numCPUs = uint32(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if numCPUs == 0 {
		return 0, 0
	}

	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage) -
		float64(s.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(s.CPUStats.SystemUsage) -
		float64(s.PreCPUStats.SystemUsage)

	if sysDelta > 0 && cpuDelta >= 0 {
		raw := cpuDelta / sysDelta * float64(numCPUs) * 100.0
		percent = math.Round(raw*100) / 100 // round to 2 decimal places
	}
	return
}

// cgroupStatValue reads a memory sub-counter from the stats map.
// It tries v1Key first (cgroups v1) and falls back to v2Key (cgroups v2).
func cgroupStatValue(statsMap map[string]uint64, v1Key, v2Key string) uint64 {
	if v, ok := statsMap[v1Key]; ok {
		return v
	}
	return statsMap[v2Key]
}

// parseReplicaSlot extracts the integer slot number from a Swarm task name.
// The real format is "<service_name>.<slot>.<task_id>",
// e.g. "admin_api.2.4ravjql7ufu3ickewjp0ekdez".
// If the task name is empty or doesn't match the expected format, this returns nil.
// If the slot number is 0, this indicates a global service container.
func parseReplicaSlot(taskName string) *int {
	if taskName == "" {
		return nil
	}
	parts := strings.Split(taskName, ".")
	if len(parts) < 2 {
		return nil
	}
	for _, part := range parts[1:] {
		if slot, err := strconv.Atoi(part); err == nil {
			return &slot
		}
	}
	// No numeric slot found — global service container
	zero := 0
	return &zero
}
