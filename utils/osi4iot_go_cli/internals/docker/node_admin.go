package docker

import (
	"fmt"
	"sort"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file backs `osi4iot node`. It reads and writes the swarm's own
// view of a node, and joins it with what the state file says about the
// same machine.
//
// # Why the join matters
//
// Docker knows a node as a hostname, a swarm role and an availability.
// osi4iot knows it as an entry in NodesData with a role of its own —
// "Manager", "Platform worker" or "NFS server" — and those two ideas of
// "role" are not the same thing: an osi4iot "NFS server" is a swarm
// worker, and a "Platform worker" is where Patroni and NATS replicas
// are pinned.
//
// The placement labels are the part nobody can see today.
// nodesConfiguration writes nats_N, admin-id, metrics-id and nfs_server
// onto the swarm nodes from the state file, and there is no command
// that shows them. Knowing which machine carries admin-id=2 is the
// difference between understanding where a Patroni replica will land
// and guessing.
//
// # Nothing here adds or removes a node
//
// Joining a machine to the platform means an entry in the state file,
// an SSH key installed on it, a swarm join, a relabelling that moves
// replica placement, and possibly an NFS mount. Removing one means
// asking about manager quorum, about Patroni leaders and about the NFS
// server before anything happens. Those belong in their own commands,
// with their own guards; this file deliberately stops at what Docker
// can answer for.

// PlatformLabelPrefixes are the node labels nodesConfiguration manages.
// Anything with one of these names is rewritten from the state file on
// the next init or run.
var PlatformLabelPrefixes = []string{
	"platform_worker", "nfs_server", "nats_", "admin-id", "metrics-id",
}

// NodeView is one machine, as both Docker and the state file see it.
type NodeView struct {
	Node swarm.Node

	// Platform is the state file's entry for this machine, matched by
	// address or hostname. Zero when the swarm has a node the state
	// file does not describe — which is itself worth showing.
	Platform      pt.NodeData
	InStateFile   bool
	IsLeader      bool
	RunningTasks  int
	PlacementTags []string
}

// Hostname is the machine's name as the swarm knows it.
func (v NodeView) Hostname() string { return v.Node.Description.Hostname }

// Address is the node's advertised address, falling back to the state
// file when the swarm does not report one.
func (v NodeView) Address() string {
	if v.Node.Status.Addr != "" && v.Node.Status.Addr != "0.0.0.0" {
		return v.Node.Status.Addr
	}
	return v.Platform.NodeIP
}

// SwarmRole is "manager" or "worker".
func (v NodeView) SwarmRole() string { return string(v.Node.Spec.Role) }

// Availability is "active", "pause" or "drain".
func (v NodeView) Availability() string { return string(v.Node.Spec.Availability) }

// State is the swarm's view of reachability: "ready", "down"...
func (v NodeView) State() string { return string(v.Node.Status.State) }

// PlatformRole is the state file's role, or "" for a node the platform
// does not know about.
func (v NodeView) PlatformRole() string { return v.Platform.NodeRole }

// OtherLabels are the node's labels that the platform does not manage:
// whatever the operator has set by hand, as "key=value", sorted.
//
// Kept apart from PlacementTags because the two have different
// lifetimes — nodesConfiguration rewrites its own on every init and run
// — and because when a listing has to truncate, the placement ones are
// the ones that must survive.
func (v NodeView) OtherLabels() []string {
	var labels []string
	for key, value := range v.Node.Spec.Labels {
		if IsPlatformManagedLabel(key) {
			continue
		}
		labels = append(labels, key+"="+value)
	}
	sort.Strings(labels)
	return labels
}

// ListNodeViews returns every swarm node joined with its state file
// entry, sorted so managers come first and then by hostname.
func ListNodeViews(pd *pt.PlatformData, dc *pt.DockerClient) ([]NodeView, error) {
	nodes, err := dc.Cli.NodeList(dc.Ctx, types.NodeListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing swarm nodes: %w", err)
	}

	// One task listing for the whole swarm rather than one per node:
	// the API filters by node, but a dozen round trips to count
	// containers is a dozen round trips.
	taskCounts, err := runningTaskCountsByNode(dc)
	if err != nil {
		return nil, err
	}

	views := make([]NodeView, 0, len(nodes))
	for _, node := range nodes {
		view := NodeView{
			Node:          node,
			IsLeader:      node.ManagerStatus != nil && node.ManagerStatus.Leader,
			RunningTasks:  taskCounts[node.ID],
			PlacementTags: placementTags(node.Spec.Labels),
		}
		view.Platform, view.InStateFile = matchStateFileNode(pd, node)
		views = append(views, view)
	}

	sort.Slice(views, func(i, j int) bool {
		if views[i].SwarmRole() != views[j].SwarmRole() {
			return views[i].SwarmRole() == string(swarm.NodeRoleManager)
		}
		return views[i].Hostname() < views[j].Hostname()
	})

	return views, nil
}

// GetNodeView finds one node by hostname, address or id prefix.
//
// Three ways in because there is no single obvious handle: the id is
// what Docker prints, the hostname is what an operator remembers, and
// the address is what the state file records.
func GetNodeView(pd *pt.PlatformData, dc *pt.DockerClient, ref string) (NodeView, error) {
	views, err := ListNodeViews(pd, dc)
	if err != nil {
		return NodeView{}, err
	}

	var matches []NodeView
	for _, view := range views {
		switch {
		case view.Node.ID == ref,
			view.Hostname() == ref,
			view.Address() == ref,
			view.Platform.NodeLabel != "" && view.Platform.NodeLabel == ref,
			len(ref) >= 6 && strings.HasPrefix(view.Node.ID, ref):
			matches = append(matches, view)
		}
	}

	switch len(matches) {
	case 1:
		return matches[0], nil
	case 0:
		return NodeView{}, fmt.Errorf("no node matches '%s'. 'osi4iot node ls' shows them", ref)
	default:
		names := make([]string, len(matches))
		for i, match := range matches {
			names[i] = match.Hostname()
		}
		return NodeView{}, fmt.Errorf("'%s' matches more than one node (%s): use the full id",
			ref, strings.Join(names, ", "))
	}
}

// ListNodeTasks returns the tasks scheduled on one node, newest first.
//
// By default only the ones the swarm intends to keep running, which is
// what `docker node ps` shows and what "what is on this machine" means.
// Filtered on DESIRED state rather than current state on purpose: a
// task that is preparing or starting is on its way to running and
// hiding it would make a node look empty in the middle of a deploy,
// while a task that is crash-looping has a desired state of running and
// is exactly what someone is looking for.
//
// all includes the finished ones — shutdown, failed, rejected — which
// is the other half of the question: "what happened here" is usually
// answered by a task that died ten minutes ago rather than by the ones
// that are fine.
func ListNodeTasks(dc *pt.DockerClient, nodeID string, all bool) ([]swarm.Task, error) {
	f := filters.NewArgs()
	f.Add("node", nodeID)
	if !all {
		f.Add("desired-state", "running")
	}

	tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: f})
	if err != nil {
		return nil, fmt.Errorf("error listing the tasks on the node: %w", err)
	}

	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].UpdatedAt.After(tasks[j].UpdatedAt)
	})
	return tasks, nil
}

// SetNodeAvailability drains, pauses or activates a node.
func SetNodeAvailability(dc *pt.DockerClient, view NodeView, availability swarm.NodeAvailability) error {
	spec := view.Node.Spec
	spec.Availability = availability

	if err := dc.Cli.NodeUpdate(dc.Ctx, view.Node.ID, view.Node.Version, spec); err != nil {
		return fmt.Errorf("error setting %s to %s: %w", view.Hostname(), availability, err)
	}
	return nil
}

// UpdateNodeLabels adds and removes labels on a node.
//
// Note what this cannot promise: nodesConfiguration rewrites the labels
// in PlatformLabelPrefixes from the state file on every init and run,
// so a label with one of those names lasts only until the next
// deployment. The caller is expected to say so.
func UpdateNodeLabels(dc *pt.DockerClient, view NodeView, add map[string]string, remove []string) error {
	spec := view.Node.Spec
	if spec.Labels == nil {
		spec.Labels = map[string]string{}
	}

	for key, value := range add {
		spec.Labels[key] = value
	}
	for _, key := range remove {
		delete(spec.Labels, key)
	}

	if err := dc.Cli.NodeUpdate(dc.Ctx, view.Node.ID, view.Node.Version, spec); err != nil {
		return fmt.Errorf("error updating the labels of %s: %w", view.Hostname(), err)
	}
	return nil
}

// IsPlatformManagedLabel reports whether a label name is one
// nodesConfiguration rewrites.
func IsPlatformManagedLabel(key string) bool {
	for _, prefix := range PlatformLabelPrefixes {
		if key == prefix || strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

// CountManagers returns how many nodes are managers, and how many of
// those are currently reachable.
//
// Both numbers are needed to say anything useful about quorum: a swarm
// keeps working while a majority of its managers are reachable, so
// three managers with one down is fine and three with two down is not.
func CountManagers(views []NodeView) (total, reachable int) {
	for _, view := range views {
		if view.SwarmRole() != string(swarm.NodeRoleManager) {
			continue
		}
		total++
		if view.Node.ManagerStatus != nil && view.Node.ManagerStatus.Reachability == swarm.ReachabilityReachable {
			reachable++
		}
	}
	return total, reachable
}

// runningTaskCountsByNode counts the running tasks on each node.
func runningTaskCountsByNode(dc *pt.DockerClient) (map[string]int, error) {
	f := filters.NewArgs()
	f.Add("desired-state", "running")

	tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: f})
	if err != nil {
		return nil, fmt.Errorf("error listing swarm tasks: %w", err)
	}

	counts := make(map[string]int)
	for _, task := range tasks {
		if task.Status.State == swarm.TaskStateRunning {
			counts[task.NodeID]++
		}
	}
	return counts, nil
}

// placementTags picks out the labels that decide where the platform's
// replicas run, in a stable order.
func placementTags(labels map[string]string) []string {
	var tags []string
	for key, value := range labels {
		if !IsPlatformManagedLabel(key) {
			continue
		}
		// platform_worker=true and nfs_server=true say nothing extra by
		// repeating the value; the placement ones carry a number that
		// is the whole point.
		if value == "true" {
			tags = append(tags, key)
			continue
		}
		tags = append(tags, key+"="+value)
	}
	sort.Strings(tags)
	return tags
}

// matchStateFileNode finds the state file entry for a swarm node.
//
// Matched on address first and hostname second. The address is what
// NodesData is keyed on everywhere else in this CLI — pt.DCMap is built
// from it — and the hostname is the fallback for a node whose
// advertised address the swarm reports differently from what was
// configured.
func matchStateFileNode(pd *pt.PlatformData, node swarm.Node) (pt.NodeData, bool) {
	if pd == nil {
		return pt.NodeData{}, false
	}

	address := node.Status.Addr
	hostname := node.Description.Hostname

	for _, candidate := range pd.PlatformInfo.NodesData {
		if candidate.NodeIP != "" && candidate.NodeIP == address {
			return candidate, true
		}
	}
	for _, candidate := range pd.PlatformInfo.NodesData {
		if candidate.NodeHostName != "" && candidate.NodeHostName == hostname {
			return candidate, true
		}
	}
	return pt.NodeData{}, false
}