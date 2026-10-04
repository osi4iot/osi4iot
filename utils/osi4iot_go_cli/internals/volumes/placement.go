package volumes

import (
	"fmt"
	"regexp"
	"strconv"

	"github.com/docker/docker/api/types"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// volumeNodeFilter reports whether a volume should be created on a node.
type volumeNodeFilter func(vol pt.Volume, dc *pt.DockerClient) bool

// pinnedVolumes maps the per-replica volume of each pinned service to the
// node label its service is constrained to. Must match the services'
// placement constraints and the labels addNodesLabels hands out:
//
//	nats<N>_data             nats<N>          node.labels.nats_<N>==true
//	patroni_admin<N>-data    patroni_admin<N>   node.labels.admin-id==<N>
//	patroni_metrics<N>-data  patroni_metrics<N> node.labels.metrics-id==<N>
//	garage_meta_<N>          garage_<N>         node.labels.garage_<N>==true
//	garage_data_<N>          garage_<N>         node.labels.garage_<N>==true
var pinnedVolumes = []struct {
	pattern *regexp.Regexp
	label   func(replica int) (key, value string)
}{
	{
		regexp.MustCompile(`^nats(\d+)_data$`),
		func(n int) (string, string) { return fmt.Sprintf("nats_%d", n), "true" },
	},
	{
		regexp.MustCompile(`^patroni_admin(\d+)-data$`),
		func(n int) (string, string) { return "admin-id", strconv.Itoa(n) },
	},
	{
		regexp.MustCompile(`^patroni_metrics(\d+)-data$`),
		func(n int) (string, string) { return "metrics-id", strconv.Itoa(n) },
	},
	{
		regexp.MustCompile(`^garage_(?:meta|data)_(\d+)$`),
		func(n int) (string, string) { return fmt.Sprintf("garage_%d", n), "true" },
	},
}

// pinnedVolumeLabel returns the node label a pinned volume belongs to.
func pinnedVolumeLabel(name string) (key, value string, ok bool) {
	for _, p := range pinnedVolumes {
		m := p.pattern.FindStringSubmatch(name)
		if m == nil {
			continue
		}
		replica, err := strconv.Atoi(m[1])
		if err != nil {
			return "", "", false
		}
		key, value = p.label(replica)
		return key, value, true
	}
	return "", "", false
}

// placementFilter decides where each volume of a multi-node platform is
// created, from the labels the nodes actually carry in the swarm — the
// same labels the services' placement constraints read, so a volume
// always lands where its service will run.
//
//   - Pinned replicas (NATS, Patroni): only on the node with their label.
//     A replica whose label no node carries (a platform with no workers,
//     where the services run on the managers unconstrained) gets no
//     volume here: Swarm creates it where the task is placed.
//   - vector_buffer: on every node — vector is a global service.
//   - Everything else (pipelines, pgadmin4, grafana, ...): on no node.
//     Their services may run on any eligible node, so a copy created
//     everywhere protects nothing: a task that moves would find an empty
//     one anyway. Swarm creates the volume where the task lands, with the
//     platform's labels (see ServiceBuilder.WithMounts), so `osi4iot
//     delete` still removes it.
//
// Volumes with a cluster-wide driver (EBS) keep the previous, role-based
// creation: Swarm would auto-create them with the local driver, and an
// EBS volume belongs to the cluster rather than to one node anyway.
func placementFilter(pd *pt.PlatformData, labelsByNode map[string]map[string]string) volumeNodeFilter {
	return func(vol pt.Volume, dc *pt.DockerClient) bool {
		if vol.Driver != "" && vol.Driver != "local" {
			return roleVolumeNames(dc.Node.NodeRole, pd)[vol.Name]
		}
		if vol.Name == "vector_buffer" {
			return true
		}
		if key, value, ok := pinnedVolumeLabel(vol.Name); ok {
			return labelsByNode[dc.Node.NodeIP][key] == value
		}
		return false
	}
}

// swarmNodeLabels returns every swarm node's labels, keyed by node
// address, read through a manager's client.
//
// Read from the swarm rather than recomputed from the state file:
// they are what the services' placement constraints are matched
// against. addNodesLabels runs before the volumes are created, so they
// are in place by then.
func swarmNodeLabels() (map[string]map[string]string, error) {
	var manager *pt.DockerClient
	for _, dc := range pt.DCMap {
		if dc != nil && dc.Cli != nil && dc.Node.NodeRole == "Manager" {
			manager = dc
			break
		}
	}
	if manager == nil {
		return nil, fmt.Errorf("no reachable manager to read the node labels from")
	}

	nodes, err := manager.Cli.NodeList(manager.Ctx, types.NodeListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing swarm nodes: %w", err)
	}

	labels := make(map[string]map[string]string, len(nodes))
	for _, n := range nodes {
		labels[n.Status.Addr] = n.Spec.Labels
	}
	return labels, nil
}

// NodeForPinnedVolume returns the client of the node that holds a pinned
// replica's volume (see pinnedVolumes): the node carrying the replica's
// placement label, read from the swarm.
//
// For anything that has to reach a replica's volume directly — creating
// it ahead of a scale-up, wiping it for a restore — while holding the
// manager's client: a pinned replica's local volume exists only on its
// own node, and the manager would answer "not found" (or, worse, create
// an empty one of its own).
//
// fallback is returned when the volume has no single node of its own:
// a single-node platform (fallback is that node) or a name that is not
// a pinned volume. An error when the label is on no node, or on a node
// this CLI cannot reach.
func NodeForPinnedVolume(pi pt.PlatformInfo, fallback *pt.DockerClient, volumeName string) (*pt.DockerClient, error) {
	key, value, pinned := pinnedVolumeLabel(volumeName)
	if len(pi.NodesData) == 1 || !pinned {
		return fallback, nil
	}

	labelsByNode, err := swarmNodeLabels()
	if err != nil {
		return nil, fmt.Errorf("error reading the swarm node labels for volume %s: %w", volumeName, err)
	}
	for nodeAddr, labels := range labelsByNode {
		if labels[key] != value {
			continue
		}
		target := pt.DCMap[nodeAddr]
		if target == nil || target.Cli == nil {
			return nil, fmt.Errorf("node %s holds volume %s (label %s=%s) but is unreachable",
				nodeAddr, volumeName, key, value)
		}
		return target, nil
	}
	return nil, errNoNodeForVolume{volumeName, key, value}
}

// errNoNodeForVolume: no node carries the label a pinned volume belongs to.
type errNoNodeForVolume struct{ volume, key, value string }

func (e errNoNodeForVolume) Error() string {
	return fmt.Sprintf("no node carries %s=%s, the label volume %s belongs to", e.key, e.value, e.volume)
}

// createPinnedVolume creates a pinned replica's volume on the node that
// will run the replica — the one carrying its placement label — rather
// than on the node behind dc (see NodeForPinnedVolume).
//
// For the scale paths, which hold the manager's client: creating
// through it put an empty copy of every new replica's volume on the
// manager, while Swarm created the real one on the worker the replica
// was placed on.
//
// A cluster-wide driver (EBS) is created through dc, as before: any node
// can create it. When no node carries the label (a platform with no
// workers, where the replicas run on the managers unconstrained),
// nothing is created and Swarm creates the volume — labelled, see
// ServiceBuilder.WithMounts — wherever it places the task.
func createPinnedVolume(pi pt.PlatformInfo, dc *pt.DockerClient, vol *pt.Volume) error {
	target := dc
	if vol.Driver == "" || vol.Driver == "local" {
		var err error
		target, err = NodeForPinnedVolume(pi, dc, vol.Name)
		if _, none := err.(errNoNodeForVolume); none {
			return nil
		}
		if err != nil {
			return err
		}
	}
	if err := CreateVolume(target, pi.DomainName, vol); err != nil {
		return fmt.Errorf("error creating volume %s in node %s: %v", vol.Name, target.Node.NodeIP, err)
	}
	return nil
}