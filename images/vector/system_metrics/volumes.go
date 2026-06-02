package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

var allowedVolumeNamesPrefix = []string{
	"admin_api_log",
	"grafana_data",
	"letsencrypt",
	"minio_data",
	"minio_storage",
	"pgadmin4_data",
	"pgdata",
	"pipelines_data",
	"timescaledb_data",
	"timescaledb_wal",
	"vector_buffer",
	"nats",
}

// ContainerVolumeMetric maps 1-to-1 to the volume_metrics TimescaleDB table.
// One row is emitted per (container, mount_destination) pair.
type ContainerVolumeMetric struct {
	// Timescale primary key components
	Time             time.Time `json:"time"`
	ContainerID      string    `json:"container_id"`
	MountDestination string    `json:"mount_destination"`

	// Docker / Swarm identity
	ContainerName string `json:"container_name"`
	NodeID        string `json:"node_id"`
	NodeName      string `json:"node_name"`
	Stack         string `json:"stack"`
	Service       string `json:"service"`
	TaskID        string `json:"task_id"`
	TaskName      string `json:"task_name"`
	ReplicaSlot   *int   `json:"replica_slot,omitempty"`

	// Mount / volume descriptor
	VolumeName  string `json:"volume_name,omitempty"`
	MountType   string `json:"mount_type"`   // volume | bind | npipe
	MountSource string `json:"mount_source"` // host path or volume name
	Driver      string `json:"driver,omitempty"`

	// Filesystem usage — obtained via nsenter(1) into the container's mount
	// namespace, running df(1) against the mount destination. This approach
	// works regardless of the volume driver (local, Rex-Ray/EBS, NFS, etc.)
	// because we observe the filesystem exactly as the container sees it.
	UsedBytes      int64   `json:"used_bytes"`
	AvailableBytes int64   `json:"available_bytes"`
	TotalBytes     int64   `json:"total_bytes"`
	UsagePercent   float64 `json:"usage_percent"` // used / (used + avail) × 100

	// Mount flags
	ReadOnly    bool   `json:"read_only"`
	Propagation string `json:"propagation,omitempty"`
}

// collectVolumes inspects every running container's mount list and emits one
// ContainerVolumeMetric per meaningful mount (skipping tmpfs and OS-internal
// bind mounts).
//
// Disk usage is measured by entering the container's mount namespace via
// nsenter(1) and running df(1) against the mount destination inside the
// container. This is driver-agnostic: it works for local volumes, Rex-Ray/EBS,
// NFS, and any other volume plugin without needing to resolve host-side paths.
//
// Required in the Vector/collector container:
//   - /var/run/docker.sock mounted        (Docker API access)
//   - /proc mounted at PROCFS_ROOT        (mount namespace entry via nsenter)
//   - util-linux installed in the image   (provides nsenter)
//
// Environment variables:
//
//	PROCFS_ROOT   host /proc bind-mount path  (default: /host/proc)
func collectVolumes(pretty bool) error {
	procfsRoot := os.Getenv("PROCFS_ROOT")
	if procfsRoot == "" {
		procfsRoot = "/host/proc"
	}

	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return fmt.Errorf("could not connect to Docker daemon: %w", err)
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	info, err := cli.Info(ctx)
	if err != nil {
		return fmt.Errorf("error querying Docker info: %w", err)
	}
	nodeID := info.Swarm.NodeID
	nodeName := info.Name

	// Build a name→driver map from DiskUsage to avoid an extra VolumeList call.
	volDrivers := map[string]string{}
	if du, err := cli.DiskUsage(ctx, types.DiskUsageOptions{}); err == nil {
		for _, v := range du.Volumes {
			if v.Name != "" && v.Driver != "" {
				volDrivers[v.Name] = v.Driver
			}
		}
	}

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: false})
	if err != nil {
		return fmt.Errorf("error listing containers: %w", err)
	}

	now := time.Now().UTC()
	enc := json.NewEncoder(os.Stdout)
	if pretty {
		enc.SetIndent("", "  ")
	}

	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		labels := c.Labels
		app := labelOrDefault(labels, "app", "unknown")
		stack := labelOrDefault(labels, "com.docker.stack.namespace", app)
		service := labelOrDefault(labels, "com.docker.swarm.service.name", "")
		taskID := labelOrDefault(labels, "com.docker.swarm.task.id", "")
		taskName := labelOrDefault(labels, "com.docker.swarm.task.name", "")
		replicaSlot := parseReplicaSlot(taskName)

		inspect, err := cli.ContainerInspect(ctx, c.ID)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[volume_metrics] inspect(%s): %v\n", c.ID[:12], err)
			continue
		}

		pid := inspect.State.Pid

		for _, m := range inspect.Mounts {
			mountType := string(m.Type)

			if !hasAllowedVolumeNamePrefix(m.Name, allowedVolumeNamesPrefix) {
				continue
			}

			// tmpfs lives entirely in RAM — skip.
			if mountType == "tmpfs" {
				continue
			}

			// Skip bind mounts to OS or Docker infrastructure paths.
			if isSystemMount(mountType, m.Source) {
				continue
			}

			// Prefer the driver from the volume list (more authoritative);
			// fall back to the driver recorded on the MountPoint.
			driver := volDrivers[m.Name]
			if driver == "" {
				driver = m.Driver
			}

			used, avail, total := volumeSizeBytesViaNsenter(procfsRoot, pid, m.Destination)

			usagePct := 0.0
			if usable := used + avail; usable > 0 {
				usagePct = float64(used) / float64(usable) * 100.0
			}

			metric := ContainerVolumeMetric{
				Time:             now,
				ContainerID:      c.ID,
				ContainerName:    name,
				NodeID:           nodeID,
				NodeName:         nodeName,
				Stack:            stack,
				Service:          service,
				TaskID:           taskID,
				TaskName:         taskName,
				ReplicaSlot:      replicaSlot,
				VolumeName:       m.Name,
				MountType:        mountType,
				MountSource:      m.Source,
				MountDestination: m.Destination,
				Driver:           driver,
				UsedBytes:        used,
				AvailableBytes:   avail,
				TotalBytes:       total,
				UsagePercent:     usagePct,
				ReadOnly:         !m.RW,
				Propagation:      string(m.Propagation),
			}

			if err := enc.Encode(metric); err != nil {
				return fmt.Errorf("error serializing volume metric for %s: %w", m.Destination, err)
			}
		}
	}

	return nil
}

// volumeSizeBytesViaNsenter enters the mount namespace of the process with the
// given PID (via nsenter) and runs df(1) against destination to obtain
// filesystem usage as the container sees it.
//
// This is driver-agnostic: it works for local volumes, Rex-Ray/EBS, NFS, and
// any other volume plugin without needing to resolve host-side paths.
//
// nsenter requires:
//   - util-linux installed in the collector image (apk add util-linux)
//   - /proc of the host mounted at procfsRoot (e.g. /host/proc)
//   - the target process to still be running
//
// Returns all zeros if the namespace cannot be entered or df fails (e.g. the
// container exited between inspect and this call).
func volumeSizeBytesViaNsenter(procfsRoot string, pid int, destination string) (used, avail, total int64) {
	if pid == 0 || destination == "" {
		return
	}

	nsPath := fmt.Sprintf("%s/%d/ns/mnt", procfsRoot, pid)

	// df --output=size,avail,used prints three columns (in bytes with -B1):
	//   1-KiB-blocks  Available  Used
	// The first line is a header; values are on the second line.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx,
		"nsenter",
		fmt.Sprintf("--mount=%s", nsPath),
		"--",
		"df", "-B1", "--output=size,avail,used", destination,
	)
	out, err := cmd.Output()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[volumes] nsenter df(pid=%d, %s): %v\n", pid, destination, err)
		return
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 2 {
		fmt.Fprintf(os.Stderr, "[volumes] nsenter df: unexpected output for %s: %q\n", destination, string(out))
		return
	}

	fields := strings.Fields(lines[1])
	if len(fields) < 3 {
		fmt.Fprintf(os.Stderr, "[volumes] nsenter df: cannot parse fields for %s: %q\n", destination, lines[1])
		return
	}

	total, _ = strconv.ParseInt(fields[0], 10, 64)
	avail, _ = strconv.ParseInt(fields[1], 10, 64)
	used, _ = strconv.ParseInt(fields[2], 10, 64)
	return
}

// systemMountPrefixes lists host paths whose bind mounts into containers are
// OS or Docker infrastructure and carry no useful disk-usage information.
var systemMountPrefixes = []string{
	"/",
	"/proc",
	"/sys",
	"/dev",
	"/run",
	"/var/run/docker.sock",
	"/var/lib/docker/containers",
	"/var/lib/docker/volumes",
	"/etc/hostname",
	"/etc/hosts",
	"/etc/resolv.conf",
}

// isSystemMount returns true for bind mounts that should be excluded.
func isSystemMount(mountType, source string) bool {
	if mountType != "bind" {
		return false
	}
	for _, p := range systemMountPrefixes {
		if source == p || strings.HasPrefix(source, p+"/") {
			return true
		}
	}
	return false
}

func hasAllowedVolumeNamePrefix(name string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}