package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
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

	// Filesystem usage — obtained via statfs(2) on the host path.
	// Requires HOSTFS_ROOT to be set (see collectContainerVolumes).
	UsedBytes      int64   `json:"used_bytes"`
	AvailableBytes int64   `json:"available_bytes"`
	TotalBytes     int64   `json:"total_bytes"`
	UsagePercent   float64 `json:"usage_percent"` // used / (used + avail) x 100

	// Mount flags
	ReadOnly    bool   `json:"read_only"`
	Propagation string `json:"propagation,omitempty"`
}

// collectContainerVolumes inspects every running container's mount list and
// emits one ContainerVolumeMetric per meaningful mount (skipping tmpfs and
// OS-internal bind mounts). Disk usage is measured via statfs(2) on the real
// host paths, which are reached through HOSTFS_ROOT.
//
// Required bind mounts in the Vector / collector container:
//
//	-v /var/run/docker.sock:/var/run/docker.sock   (Docker API access)
//	-v /:/host:ro                                  (host filesystem for statfs)
//
// The HOSTFS_ROOT env var controls where the host root is mounted (default "/host").
// If the volume driver is external (EFS, NFS, etc.) and not accessible via HOSTFS_ROOT,
// statfs returns zeros but the row is still emitted for identity tracking.
func collectVolumes(pretty bool) error {
	hostfsRoot := os.Getenv("HOSTFS_ROOT")
	if hostfsRoot == "" {
		hostfsRoot = "/host"
	}

	dockerRoot := os.Getenv("DOCKER_ROOT")
    if dockerRoot == "" {
        dockerRoot = "/var/lib/docker"
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

	// Build a name->driver map for named volumes. We reuse DiskUsage (already
	// called by the volumes collector) to avoid an extra VolumeList call.
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
		
		for _, m := range inspect.Mounts {
			mountType := string(m.Type)

			if !hasAllowedVolumeNamePrefix(m.Name, allowedVolumeNamesPrefix) {
				continue
			}

			// tmpfs lives entirely in RAM; statfs would return memory stats,
			// not disk stats — skip.
			if mountType == "tmpfs" {
				continue
			}

			// Skip bind mounts to OS or Docker infrastructure paths that carry no useful disk-usage information. 
			if isSystemMount(mountType, m.Source) {
				continue
			}

			hostPath := resolveHostPath(dockerRoot, hostfsRoot, mountType, m.Name, m.Source)
			used, avail, total := volumeSizeBytes(hostPath)

			usagePct := 0.0
			if usable := used + avail; usable > 0 {
				// Percentage = used / (used + available-to-users) x 100.
				// This matches the convention used by df and Prometheus node_exporter:
				// reserved blocks are counted as used, not available.
				usagePct = float64(used) / float64(usable) * 100.0
			}

			// Prefer the driver from the volume list (more authoritative);
			// fall back to the driver recorded on the MountPoint.
			driver := volDrivers[m.Name]
			if driver == "" {
				driver = m.Driver
			}

			metric := ContainerVolumeMetric{
				Time:               now,
				ContainerID:        c.ID,
				ContainerName:      name,
				NodeID:             nodeID,
				NodeName:           nodeName,
				Stack:              stack,
				Service:            service,
				TaskID:             taskID,
				TaskName:           taskName,
				ReplicaSlot:        replicaSlot,
				VolumeName:         m.Name,
				MountType:          mountType,
				MountSource:        m.Source,
				MountDestination:   m.Destination,
				Driver:             driver,
				UsedBytes:          used,
				AvailableBytes:     avail,
				TotalBytes:         total,
				UsagePercent:       usagePct,
				ReadOnly:           !m.RW,
				Propagation:        string(m.Propagation),
			}

			if err := enc.Encode(metric); err != nil {
				return fmt.Errorf("error serializing volume metric for %s: %w", m.Destination, err)
			}
		}
	}

	return nil
}

// resolveHostPath maps a container mount to its absolute path on the host filesystem. 
// For bind mounts, this is just the source path. For named volumes, 
// this is typically /var/lib/docker/volumes/<volume>/_data, 
// but we verify the driver to be sure (some drivers may use a different structure or be inaccessible via HOSTFS_ROOT).
func resolveHostPath(dockerRoot, hostfsRoot, mountType, volumeName, source string) string {
    if mountType == "volume" && volumeName != "" {
        return dockerRoot + "/volumes/" + volumeName + "/_data"
    }
    return hostfsRoot + source
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

// Get filesystem size info for the given path using syscall.Statfs.
func volumeSizeBytes(path string) (used, avail, total int64) {
	var s syscall.Statfs_t
	if err := syscall.Statfs(path, &s); err != nil {
		return
	}
	bs := int64(s.Bsize)
	total = int64(s.Blocks) * bs
	avail = int64(s.Bavail) * bs
	used, _ = dirSizeBytes(path) // WalkDir solo sobre el directorio del volumen
	return
}


func dirSizeBytes(path string) (int64, error) {
    var total int64
    err := filepath.WalkDir(path, func(_ string, d fs.DirEntry, err error) error {
        if err != nil {
            return nil // skip inaccessible paths
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

func hasAllowedVolumeNamePrefix(name string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}