package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/docker/docker/client"
)

// HostMetric maps 1-to-1 to the host_metrics TimescaleDB table.
// A single row is emitted per collection run. CPU usage is computed from two
// /proc/stat snapshots separated by a 500 ms window, running concurrently
// with the Docker API calls so it adds no extra latency.
type HostMetric struct {
	Time         time.Time         `json:"time"`
	NodeID   string `json:"node_id"`
	NodeName string `json:"node_name"`
	Hostname string `json:"hostname"`

	// CPU
	CPUCores        int     `json:"cpu_cores"`
	CPUUsagePercent float64 `json:"cpu_usage_percent"`
	CPULoad1        float64 `json:"cpu_load1"`
	CPULoad5        float64 `json:"cpu_load5"`
	CPULoad15       float64 `json:"cpu_load15"`

	// Memory
	MemoryTotalBytes     int64   `json:"memory_total_bytes"`
	MemoryUsedBytes      int64   `json:"memory_used_bytes"`
	MemoryAvailableBytes int64   `json:"memory_available_bytes"`
	MemoryUsagePercent   float64 `json:"memory_usage_percent"`

	// Swap
	SwapTotalBytes int64 `json:"swap_total_bytes"`
	SwapUsedBytes  int64 `json:"swap_used_bytes"`

	// Root filesystem — statfs(2) on HOSTFS_ROOT
	RootfsTotalBytes     int64   `json:"rootfs_total_bytes"`
	RootfsUsedBytes      int64   `json:"rootfs_used_bytes"`
	RootfsAvailableBytes int64   `json:"rootfs_available_bytes"`
	RootfsUsagePercent   float64 `json:"rootfs_usage_percent"`

	// Network — aggregated across all physical interfaces
	// (uses the same isVirtual filter as the network collector)
	NetworkRxBytesTotal  uint64 `json:"network_rx_bytes_total"`
	NetworkTxBytesTotal  uint64 `json:"network_tx_bytes_total"`
	NetworkRxErrorsTotal uint64 `json:"network_rx_errors_total"`
	NetworkTxErrorsTotal uint64 `json:"network_tx_errors_total"`

	// Docker daemon state
	DockerContainersRunning int `json:"docker_containers_running"`
	DockerContainersPaused  int `json:"docker_containers_paused"`
	DockerContainersStopped int `json:"docker_containers_stopped"`
	DockerImagesCount       int `json:"docker_images_count"`
}

// collectHost gathers every column required by the host_metrics table and
// emits a single JSON object to stdout.
//
// Environment variables (shared with other collectors):
//
//	PROCFS_ROOT   host /proc bind-mount path  (default: /host/proc)
//	HOSTFS_ROOT   host root filesystem path   (default: /host)
//
// Required container mounts:
//
//	-v /proc:/host/proc:ro
//	-v /:/host:ro
//	-v /var/run/docker.sock:/var/run/docker.sock
func collectHost(pretty bool) error {
	procfsRoot := os.Getenv("PROCFS_ROOT")
	if procfsRoot == "" {
		procfsRoot = "/host/proc"
	}
	hostfsRoot := os.Getenv("HOSTFS_ROOT")
	if hostfsRoot == "" {
		hostfsRoot = "/host"
	}

	// ── CPU sampling — concurrent with Docker API calls ──────────────────────
	// Two /proc/stat reads 500 ms apart give a reliable CPU usage estimate.
	// We launch this goroutine first so the sleep overlaps with the API calls.
	type cpuPair struct{ s1, s2 procCPUStat }
	cpuCh := make(chan cpuPair, 1)
	go func() {
		s1, _ := readProcCPUStat(filepath.Join(procfsRoot, "stat"))
		time.Sleep(500 * time.Millisecond)
		s2, _ := readProcCPUStat(filepath.Join(procfsRoot, "stat"))
		cpuCh <- cpuPair{s1, s2}
	}()

	// ── Docker API ───────────────────────────────────────────────────────────
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

	hostname := info.Name
	nodeID := info.Swarm.NodeID
	if nodeID == "" {
		nodeID = hostname // stable identifier for non-Swarm daemons
	}
	nodeName := hostname

	// On Swarm nodes, prefer the hostname registered in the Swarm descriptor.
	// NodeInspect is intentionally avoided here — it only works on managers
	// and swarm_role / availability are now tracked in host_node_state.
	if info.Swarm.NodeID != "" {
		if n, _, err := cli.NodeInspectWithRaw(ctx, info.Swarm.NodeID); err == nil {
			nodeName = n.Description.Hostname
		}
		// NodeInspect failure on workers is expected and silently ignored.
	}

	// ── Procfs (fast, no blocking) ───────────────────────────────────────────
	load1, load5, load15, _ := readProcLoadAvg(filepath.Join(procfsRoot, "loadavg"))
	memInfo, _ := readProcMemInfo(filepath.Join(procfsRoot, "meminfo"))
	// /proc/1/net/dev reaches the host root network namespace
	netStats, _ := readProcNetAggregated(filepath.Join(procfsRoot, "1", "net", "dev"))

	// ── Root filesystem — statfsPath defined in volume.go ─────────
	rootUsed, rootAvail, rootTotal:= statfsPath(hostfsRoot)
	rootUsagePct := 0.0
	if usable := rootUsed + rootAvail; usable > 0 {
		rootUsagePct = float64(rootUsed) / float64(usable) * 100.0
	}

	// ── Memory ───────────────────────────────────────────────────────────────
	memTotal := memInfo["MemTotal"]
	memAvail := memInfo["MemAvailable"]
	memUsed := memTotal - memAvail // mirrors `free -m` "used" column
	memUsagePct := 0.0
	if memTotal > 0 {
		memUsagePct = math.Round(float64(memUsed)/float64(memTotal)*10000) / 100
	}
	swapTotal := memInfo["SwapTotal"]
	swapUsed := swapTotal - memInfo["SwapFree"]

	// ── CPU — goroutine should be done by now; API calls take well over 500 ms
	cr := <-cpuCh

	m := HostMetric{
		Time:         time.Now().UTC(),
		NodeID:       nodeID,
		NodeName:     nodeName,
		Hostname:     hostname,

		CPUCores:        cr.s1.cores,
		CPUUsagePercent: calcProcCPUPercent(cr.s1, cr.s2),
		CPULoad1:        load1,
		CPULoad5:        load5,
		CPULoad15:       load15,

		MemoryTotalBytes:     memTotal,
		MemoryUsedBytes:      memUsed,
		MemoryAvailableBytes: memAvail,
		MemoryUsagePercent:   memUsagePct,

		SwapTotalBytes: swapTotal,
		SwapUsedBytes:  swapUsed,

		RootfsTotalBytes:     rootTotal,
		RootfsUsedBytes:      rootUsed,
		RootfsAvailableBytes: rootAvail,
		RootfsUsagePercent:   rootUsagePct,

		NetworkRxBytesTotal:  netStats.rxBytes,
		NetworkTxBytesTotal:  netStats.txBytes,
		NetworkRxErrorsTotal: netStats.rxErrors,
		NetworkTxErrorsTotal: netStats.txErrors,

		DockerContainersRunning: info.ContainersRunning,
		DockerContainersPaused:  info.ContainersPaused,
		DockerContainersStopped: info.ContainersStopped,
		DockerImagesCount:       info.Images,
	}

	enc := json.NewEncoder(os.Stdout)
	if pretty {
		enc.SetIndent("", "  ")
	}
	return enc.Encode(m)
}

// =============================================================================
// /proc/stat helpers
// =============================================================================

type procCPUStat struct {
	idle  uint64 // idle + iowait jiffies (aggregate across all CPUs)
	total uint64 // sum of all jiffy columns
	cores int    // number of logical CPUs (cpu0, cpu1, … lines)
}

// readProcCPUStat parses /proc/stat.
//
// Column order after "cpu" (0-indexed):
//
//	0=user 1=nice 2=system 3=idle 4=iowait 5=irq 6=softirq 7=steal [8=guest 9=guest_nice]
func readProcCPUStat(path string) (procCPUStat, error) {
	f, err := os.Open(path)
	if err != nil {
		return procCPUStat{}, err
	}
	defer f.Close()

	var s procCPUStat
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "cpu") {
			break // cpu* lines are always at the top of /proc/stat
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		if fields[0] == "cpu" {
			// Aggregate line — all CPUs combined
			var nums [10]uint64
			for i := 1; i < len(fields) && i <= 10; i++ {
				nums[i-1], _ = strconv.ParseUint(fields[i], 10, 64)
			}
			s.idle = nums[3] + nums[4] // idle + iowait
			for _, v := range nums {
				s.total += v
			}
		} else {
			s.cores++ // cpu0, cpu1, …
		}
	}
	return s, scanner.Err()
}

// calcProcCPUPercent computes CPU usage % from two /proc/stat snapshots.
//
//	usage = (1 − idle_delta / total_delta) × 100
func calcProcCPUPercent(s1, s2 procCPUStat) float64 {
	totalDelta := float64(s2.total - s1.total)
	idleDelta := float64(s2.idle - s1.idle)
	if totalDelta <= 0 {
		return 0
	}
	pct := (1.0 - idleDelta/totalDelta) * 100.0
	if pct < 0 {
		pct = 0
	}
	return math.Round(pct*100) / 100
}

// =============================================================================
// /proc/loadavg helpers
// =============================================================================

// readProcLoadAvg returns the 1-, 5-, and 15-minute load averages.
// File format: "0.12 0.34 0.56 2/512 12345"
func readProcLoadAvg(path string) (load1, load5, load15 float64, err error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	fields := strings.Fields(string(data))
	if len(fields) < 3 {
		err = fmt.Errorf("unexpected /proc/loadavg format")
		return
	}
	load1, _ = strconv.ParseFloat(fields[0], 64)
	load5, _ = strconv.ParseFloat(fields[1], 64)
	load15, _ = strconv.ParseFloat(fields[2], 64)
	return
}

// =============================================================================
// /proc/meminfo helpers
// =============================================================================

// readProcMemInfo parses /proc/meminfo and returns a map of key → bytes.
// Values in the file are in kibibytes (kB) and are converted to bytes here.
// Relevant keys: MemTotal, MemAvailable, SwapTotal, SwapFree.
func readProcMemInfo(path string) (map[string]int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	m := make(map[string]int64, 32)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		// Format: "MemTotal:       16384000 kB"
		line := scanner.Text()
		colonIdx := strings.Index(line, ":")
		if colonIdx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:colonIdx])
		parts := strings.Fields(strings.TrimSpace(line[colonIdx+1:]))
		if len(parts) == 0 {
			continue
		}
		val, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			continue
		}
		if len(parts) > 1 && strings.EqualFold(parts[1], "kb") {
			val *= 1024
		}
		m[key] = val
	}
	return m, scanner.Err()
}

// =============================================================================
// /proc/1/net/dev aggregation helpers
// =============================================================================

type hostNetStats struct {
	rxBytes  uint64
	txBytes  uint64
	rxErrors uint64
	txErrors uint64
}

// readProcNetAggregated sums rx/tx bytes and rx/tx errors across all physical
// interfaces in the host network namespace (reached via /proc/1/net/dev).
// Virtual interfaces are excluded using isVirtual() from network.go.
//
// /proc/net/dev column layout (0-indexed after the colon):
//
//	Receive:  0=bytes 1=packets 2=errs 3=drop …
//	Transmit: 8=bytes 9=packets 10=errs 11=drop …
func readProcNetAggregated(path string) (hostNetStats, error) {
	f, err := os.Open(path)
	if err != nil {
		return hostNetStats{}, err
	}
	defer f.Close()

	var s hostNetStats
	lineNo := 0
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lineNo++
		if lineNo <= 2 {
			continue // skip the two header lines
		}
		line := scanner.Text()
		colonIdx := strings.Index(line, ":")
		if colonIdx < 0 {
			continue
		}
		iface := strings.TrimSpace(line[:colonIdx])
		if isVirtual(iface) { // isVirtual is defined in network.go
			continue
		}
		fields := strings.Fields(line[colonIdx+1:])
		if len(fields) < 16 {
			continue
		}
		rxB, _ := strconv.ParseUint(fields[0], 10, 64)
		rxE, _ := strconv.ParseUint(fields[2], 10, 64)
		txB, _ := strconv.ParseUint(fields[8], 10, 64)
		txE, _ := strconv.ParseUint(fields[10], 10, 64)

		s.rxBytes += rxB
		s.txBytes += txB
		s.rxErrors += rxE
		s.txErrors += txE
	}
	return s, scanner.Err()
}

// virtualPrefixes lists the prefixes of interfaces that are never
// physical and should be excluded from host network metrics:
//
//   - veth*    Docker virtual ethernet pairs (one end per container)
//   - br-*     Docker/Linux software bridges
//   - docker*  Default Docker bridge (docker0, docker_gwbridge…)
//   - virbr*   libvirt virtual bridges
//   - tun*     TUN tunnel interfaces (VPNs, etc.)
//   - tap*     TAP tunnel interfaces
//   - lo       Loopback — no meaningful throughput data
//   - dummy*   Linux dummy interfaces
//   - bond*    Bonding master (member interfaces are counted individually)
//   - ovs-*    Open vSwitch internal interfaces
var virtualPrefixes = []string{
	"veth", "br-", "docker", "virbr", "tun", "tap",
	"lo", "dummy", "bond", "ovs-",
}

// isVirtual reports whether iface should be excluded.
func isVirtual(iface string) bool {
	for _, prefix := range virtualPrefixes {
		if strings.HasPrefix(iface, prefix) {
			return true
		}
	}
	return false
}

// statfsPath calls statfs(2) on the given path and returns filesystem usage
// statistics. All byte values use the filesystem's native block size.
//
//	used   = (Blocks - Bfree) x Bsize   actual bytes consumed on disk
//	avail  = Bavail x Bsize             bytes available to unprivileged users
//	total  = Blocks x Bsize             total device capacity
//
// Returns all zeros when the path is inaccessible (e.g. external volume driver).
func statfsPath(path string) (used, avail, total int64) {
    var s syscall.Statfs_t
    if err := syscall.Statfs(path, &s); err != nil {
        fmt.Fprintf(os.Stderr, "[volumes] statfs(%s): %v\n", path, err)
        return
    }
    bs := int64(s.Bsize)
    total = int64(s.Blocks) * bs
    avail = int64(s.Bavail) * bs
    used = (int64(s.Blocks) - int64(s.Bfree)) * bs
    return
}