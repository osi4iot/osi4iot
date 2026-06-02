package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"syscall"
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

	// Filesystem usage — obtained by parsing /proc/<pid>/mountinfo to find
	// the block device backing the mount destination, then calling statfs(2)
	// on the device path via HOSTFS_ROOT. This approach is driver-agnostic
	// and works with Rex-Ray/EBS, NFS, and any other volume plugin.
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
// Disk usage is measured by parsing /proc/<pid>/mountinfo to find the block
// device backing each mount destination, then calling statfs(2) on the device
// path through HOSTFS_ROOT. No nsenter or docker exec required.
//
// Required in the Vector/collector container:
//   - /var/run/docker.sock mounted        (Docker API access)
//   - /proc mounted at PROCFS_ROOT        (mountinfo parsing)
//   - / mounted at HOSTFS_ROOT            (statfs on block devices)
//
// Environment variables:
//
//	PROCFS_ROOT   host /proc bind-mount path  (default: /host/proc)
//	HOSTFS_ROOT   host root bind-mount path   (default: /host)
func collectVolumes(pretty bool) error {
	procfsRoot := os.Getenv("PROCFS_ROOT")
	if procfsRoot == "" {
		procfsRoot = "/host/proc"
	}

	hostfsRoot := os.Getenv("HOSTFS_ROOT")
	if hostfsRoot == "" {
		hostfsRoot = "/host"
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

			used, avail, total := volumeSizeBytesViaMountInfo(procfsRoot, hostfsRoot, pid, m.Destination)

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

// volumeSizeBytesViaMountInfo parses /proc/<pid>/mountinfo to find the block
// device backing destination inside the container, then calls statfs(2) on
// the device path via hostfsRoot.
//
// /proc/<pid>/mountinfo line format (space-separated):
//
//	mountID parentID major:minor root mountpoint options ... - fstype source mountoptions
//
// Example:
//
//	1425 1387 202:80 /data /var/lib/postgresql/data rw,relatime master:727 - ext4 /dev/xvdf rw
//
// The block device ("source", field after "-" separator) is accessible from
// the collector container at hostfsRoot+devicePath (e.g. /host/dev/xvdf).
func volumeSizeBytesViaMountInfo(procfsRoot, hostfsRoot string, pid int, destination string) (used, avail, total int64) {
	if pid == 0 || destination == "" {
		return
	}

	mountinfoPath := fmt.Sprintf("%s/%d/mountinfo", procfsRoot, pid)
	data, err := os.ReadFile(mountinfoPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[volumes] mountinfo(%d): %v\n", pid, err)
		return
	}

	// Find the line whose mountpoint (field index 4) matches destination.
	var devicePath string
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}
		if fields[4] != destination {
			continue
		}
		// Fields after the "-" separator: fstype source mountoptions
		for i, f := range fields {
			if f == "-" && i+2 < len(fields) {
				devicePath = fields[i+2] // e.g. /dev/xvdf
				break
			}
		}
		break
	}

	if devicePath == "" {
		fmt.Fprintf(os.Stderr, "[volumes] mountinfo: no device found for %s (pid=%d)\n", destination, pid)
		return
	}

	// The block device is accessible from the collector container via hostfsRoot.
	// e.g. /dev/xvdf → /host/dev/xvdf
	hostDevicePath := hostfsRoot + devicePath
	var s syscall.Statfs_t
	if err := syscall.Statfs(hostDevicePath, &s); err != nil {
		fmt.Fprintf(os.Stderr, "[volumes] statfs(%s): %v\n", hostDevicePath, err)
		return
	}

	bs := int64(s.Bsize)
	total = int64(s.Blocks) * bs
	avail = int64(s.Bavail) * bs
	used = (int64(s.Blocks) - int64(s.Bfree)) * bs
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