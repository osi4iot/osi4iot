package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
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

	// Filesystem usage — obtained by:
	//   1. Parsing /proc/<pid>/mountinfo of the target container to find the
	//      block device (e.g. /dev/xvdf) backing the mount destination.
	//   2. Finding that device's mountpoint in Vector's own mountinfo, which
	//      sees Rex-Ray/EBS volumes via RSlave propagation at:
	//      /host/var/lib/docker/plugins/<id>/propagated-mount/volumes/<name>
	//   3. Calling statfs(2) on that mountpoint.
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
// Required in the Vector/collector container:
//   - /var/run/docker.sock mounted                  (Docker API access)
//   - /proc mounted at PROCFS_ROOT with RSlave       (mountinfo access)
//   - / mounted at HOSTFS_ROOT with RSlave           (statfs on Rex-Ray mountpoints)
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

	dockerRoot := os.Getenv("DOCKER_ROOT")
	if dockerRoot == "" {
		dockerRoot = "/host/var/lib/docker"
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

	// Read Vector's own mountinfo once — it contains all Rex-Ray/EBS volumes
	// visible via RSlave propagation. We use it to resolve device→mountpoint.
	selfMountinfo := procfsRoot + "/self/mountinfo"

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

			used, avail, total := volumeSizeBytesViaMountInfo(
				procfsRoot, selfMountinfo, dockerRoot,
				pid, m.Destination, driver, m.Name,
			)

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

func volumeSizeBytesViaMountInfo(procfsRoot, selfMountinfo, dockerRoot string, pid int, destination, driver, volumeName string) (used, avail, total int64) {
    if pid == 0 || destination == "" {
        return
    }

    if isExternalDriver(driver) {
        device := findDeviceForDestination(procfsRoot, pid, destination)
        if device == "" {
            fmt.Fprintf(os.Stderr, "[volumes] no device found for pid=%d destination=%s\n", pid, destination)
            return
        }
        mountpoint := findMountpointForDevice(selfMountinfo, device)
        if mountpoint == "" {
            fmt.Fprintf(os.Stderr, "[volumes] no mountpoint found in self for device=%s\n", device)
            return
        }
        return statfsPath(mountpoint)
    }

    // Local driver: statfs gives partition-level total/avail (shared across
    // all local volumes), and dirSize gives the actual bytes used by this
    // specific volume directory.
    localPath := dockerRoot + "/volumes/" + volumeName + "/_data"
    _, avail, total = statfsPath(localPath)
    used, _ = dirSizeBytes(localPath)
    return
}

func dirSizeBytes(path string) (int64, error) {
    var total int64
    err := filepath.WalkDir(path, func(_ string, d fs.DirEntry, err error) error {
        if err != nil {
            return nil
        }
        if !d.IsDir() {
            info, err := d.Info()
            if err == nil {
                total += info.Size()
            }
        }
        return nil
    })
    return total, err
}

func isExternalDriver(driver string) bool {
    d := strings.ToLower(driver)
    external := []string{
        "rexray", "rexray-ebs", "storageos",
        "nfs", "cifs", "glusterfs",
        "convoy", "flocker", "portworx",
    }
    for _, e := range external {
        if strings.HasPrefix(d, e) {
            return true
        }
    }
    return false
}

// findDeviceForDestination parses /proc/<pid>/mountinfo and returns the block
// device (source field after the "-" separator) for the given mountpoint.
//
// mountinfo line format:
//
//	mountID parentID major:minor root mountpoint options ... - fstype source mountoptions
func findDeviceForDestination(procfsRoot string, pid int, destination string) string {
	data, err := os.ReadFile(fmt.Sprintf("%s/%d/mountinfo", procfsRoot, pid))
	if err != nil {
		fmt.Fprintf(os.Stderr, "[volumes] read mountinfo(pid=%d): %v\n", pid, err)
		return ""
	}
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 10 || fields[4] != destination {
			continue
		}
		for i, f := range fields {
			if f == "-" && i+2 < len(fields) {
				return fields[i+2] // e.g. /dev/xvdf
			}
		}
	}
	return ""
}

// findMountpointForDevice parses selfMountinfo (Vector's own /proc/self/mountinfo)
// and returns the first mountpoint where device is mounted. Rex-Ray volumes
// appear here via RSlave propagation at paths like:
//
//	/host/var/lib/docker/plugins/<id>/propagated-mount/volumes/<name>
func findMountpointForDevice(selfMountinfo, device string) string {
	data, err := os.ReadFile(selfMountinfo)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[volumes] read self mountinfo: %v\n", err)
		return ""
	}
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}
		for i, f := range fields {
			if f == "-" && i+2 < len(fields) && fields[i+2] == device {
				return fields[4] // mountpoint visible from Vector
			}
		}
	}
	return ""
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
