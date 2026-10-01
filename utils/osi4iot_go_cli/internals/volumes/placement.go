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
