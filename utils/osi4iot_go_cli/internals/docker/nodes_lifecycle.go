package docker

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/volumes"
)

// Joining a machine to the platform and taking one out.
//
// # A node is more than a swarm member here
//
// It is an entry in NodesData, an SSH target with the platform's key
// installed, and — this is the part that bites — a slot in the
// placement scheme.
//
// Each "Platform worker" carries a number per pinned service (nats_N,
// admin-id, metrics-id), and instance N of the service runs where
// number N is, with its data in a local volume there. The numbers are
// stable (pinned_labels.go): removing a worker moves only the instances
// that were on it, each to a spare worker, where it rebuilds its data
// from the other instances.
//
// So removal checks, before touching anything:
//
//   - that enough workers are left for every instance (else one would be
//     pinned to a number nobody carries and sit pending forever);
//   - that no service's ONLY copy is on the node (it would come back
//     empty elsewhere — for Patroni, an empty database);
//   - that every service keeps its quorum while the instance moves.

// NodePlacementImpact describes what adding or removing a node does to
// the placement scheme.
type NodePlacementImpact struct {
	WorkersBefore int
	WorkersAfter  int

	// Moves are the NATS/Patroni instances that go to another worker,
	// where they rebuild their data from the other instances.
	Moves []pinnedMove

	// SingleCopies are instances on the node that are their service's
	// only one: moved, they would come back empty.
	SingleCopies []string

	// HomelessServices are services that would have no node carrying
	// their placement label afterwards. A non-empty list is a refusal.
	HomelessServices []string

	// GarageInstances are the Garage instances on the node, moved off
	// it before it is drained.
	GarageInstances []int

	// ManagersBefore / ManagersAfter matter for quorum.
	ManagersBefore int
	ManagersAfter  int
}

// PlanNodeRemoval works out what removing this node would do, without
// doing any of it. labels are every node's labels now, by IP.
func PlanNodeRemoval(pd *pt.PlatformData, target pt.NodeData, labels map[string]map[string]string) NodePlacementImpact {
	pi := pd.PlatformInfo
	impact := NodePlacementImpact{}

	var before, after []string
	for _, node := range pi.NodesData {
		if node.NodeRole == "Manager" {
			impact.ManagersBefore++
		}
		if node.NodeRole != "Platform worker" {
			continue
		}
		impact.WorkersBefore++
		before = append(before, node.NodeIP)
		if sameNode(node, target) {
			continue
		}
		impact.WorkersAfter++
		after = append(after, node.NodeIP)
	}

	targets := pinnedTargets(pd)
	if target.NodeRole == "Platform worker" && impact.WorkersAfter > 0 {
		impact.Moves = planPinnedMoves(targets, before, after, labels)
		names := map[string]string{}
		for _, node := range pi.NodesData {
			names[node.NodeIP] = nodeName(node)
		}
		for i := range impact.Moves {
			impact.Moves[i].From = names[impact.Moves[i].From]
			impact.Moves[i].To = names[impact.Moves[i].To]
		}
		for _, t := range targets {
			if t.replicas != 1 {
				continue
			}
			for _, id := range t.family.read(labels[target.NodeIP]) {
				if id == 1 {
					impact.SingleCopies = append(impact.SingleCopies, t.family.prefix+"1")
				}
			}
		}
	}

	impact.ManagersAfter = impact.ManagersBefore
	if target.NodeRole == "Manager" {
		impact.ManagersAfter--
	}

	// Which instances would be left pointing at a number nobody carries.
	impact.GarageInstances = GarageInstancesOn(pi, target.NodeIP)
	if impact.WorkersAfter > 0 {
		for _, t := range targets {
			for i := impact.WorkersAfter + 1; i <= t.replicas; i++ {
				impact.HomelessServices = append(impact.HomelessServices,
					fmt.Sprintf("%s%d", t.family.prefix, i))
			}
		}
	}

	return impact
}

// AddNodeToPlatform joins a machine to the platform: state file,
// SSH and system packages, swarm membership, labels.
//
// The node is APPENDED to NodesData, never inserted, because the
// placement labels are positional and appending is the only order that
// leaves the existing nodes where they are.
func AddNodeToPlatform(pd *pt.PlatformData, node pt.NodeData, logger *log.Logger) error {
	for _, existing := range pd.PlatformInfo.NodesData {
		if existing.NodeIP == node.NodeIP {
			return fmt.Errorf("this platform already has a node at %s", node.NodeIP)
		}
		if node.NodeLabel != "" && existing.NodeLabel == node.NodeLabel {
			return fmt.Errorf("this platform already has a node labelled '%s'", node.NodeLabel)
		}
	}

	previous := pd.PlatformInfo.NodesData
	pd.PlatformInfo.NodesData = append(previous, node)
	pd.PlatformInfo.NumberOfSwarmNodes = len(pd.PlatformInfo.NodesData)

	// Saved before the machine is touched. Everything below can fail
	// halfway — an unreachable host, a refused key — and a state file
	// that already names the node is what lets the operator fix the
	// machine and run the command again instead of starting over.
	if err := utils.WritePlatformDataToFile(pd); err != nil {
		pd.PlatformInfo.NodesData = previous
		pd.PlatformInfo.NumberOfSwarmNodes = len(previous)
		return fmt.Errorf("error saving the state file: %w", err)
	}

	// RESET, not just rebuild. SetDockerClientsMap is guarded by a
	// sync.Once, so calling it again after main.go already did returns
	// the old map and does nothing — which left the new node without a
	// client, and joinAllNodesToSwarm, which iterates DCMap rather than
	// NodesData, joining nothing and reporting success.
	if err := ResetDockerClientsMap(); err != nil {
		return fmt.Errorf("error closing the docker clients: %w", err)
	}
	if _, err := SetDockerClientsMap(pd, "update"); err != nil {
		return fmt.Errorf("error connecting to %s: %w\n"+
			"The node is in the state file now, so fix the machine and run this again",
			node.NodeIP, err)
	}

	// Checked explicitly, because the two things that consume the map
	// are both silent about a node missing from it: SetDockerClientsMap
	// records an unreachable node as a nil entry, and
	// joinAllNodesToSwarm simply never visits a node it cannot see.
	if dc := pt.DCMap[node.NodeIP]; dc == nil {
		return fmt.Errorf("no docker client for %s, so it cannot be joined to the swarm.\n"+
			"Check that the machine is reachable over SSH as %s with the platform's key.\n"+
			"The node is in the state file now, so fix the machine and run this again",
			node.NodeIP, node.NodeUserName)
	}

	manager, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting the manager docker client: %w", err)
	}

	// Whole-platform rather than node-specific, and idempotent: it
	// installs the firewall rules and the volume plugin where they are
	// missing. Re-running it on the nodes that are already configured
	// costs time and changes nothing.
	logger.Printf("Configuring %s (firewall, volume plugin)...", node.NodeIP)
	if err := nodesConfiguration(pd); err != nil {
		return fmt.Errorf("error configuring the nodes: %w", err)
	}

	logger.Printf("Joining %s to the swarm...", node.NodeIP)
	if err := joinAllNodesToSwarm(manager); err != nil {
		return fmt.Errorf("error joining the node to the swarm: %w", err)
	}

	// AFTER the join, never before. addNodesLabels writes onto swarm
	// nodes, and a machine that is not a member yet is not in
	// getSwarmNodesMap, so labelling it first silently skips it.
	logger.Printf("Assigning placement labels...")
	if err := addNodesLabels(pd); err != nil {
		return fmt.Errorf("error assigning the node labels: %w", err)
	}

	// Fills in the node id, architecture, CPUs and memory the swarm
	// now reports for the machine.
	if err := updateNodesData(manager, &pd.PlatformInfo.NodesData); err != nil {
		return fmt.Errorf("error reading the node's details back: %w", err)
	}
	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return fmt.Errorf("error saving the state file: %w", err)
	}

	return nil
}

// RemoveNodeFromPlatform drains a node, takes it out of the swarm and
// out of the state file.
//
// Drain first, always: a node removed while still running tasks leaves
// the swarm rescheduling them at the same moment it loses the node, and
// the containers on it are killed rather than moved.
func RemoveNodeFromPlatform(pd *pt.PlatformData, view NodeView, logger *log.Logger) error {
	manager, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting the manager docker client: %w", err)
	}

	// Garage first, while the node is still active: moving an instance
	// copies its data from the running instance, which a drain would
	// stop. Its instances go to the remaining hosts, one change at a
	// time, each finished before the next.
	if ids := GarageInstancesOn(pd.PlatformInfo, view.Address()); len(ids) > 0 {
		logger.Printf("Moving %s off %s...", instanceNames(ids), view.Hostname())
		if err := EvacuateGarageNode(pd, manager, view.Address(), logger); err != nil {
			return fmt.Errorf("error moving Garage off %s (the node has not been touched; "+
				"run the same command again to resume): %w", view.Hostname(), err)
		}
	}

	if view.Availability() != string(swarm.NodeAvailabilityDrain) {
		logger.Printf("Draining %s...", view.Hostname())
		if err := SetNodeAvailability(manager, view, swarm.NodeAvailabilityDrain); err != nil {
			return err
		}
		if err := waitForNodeDrained(manager, view.Node.ID, logger); err != nil {
			return err
		}
	}

	// Its volumes go before it leaves, while its Docker can still be
	// reached: once out of the platform, nothing would ever remove them
	// ('osi4iot delete' only visits the platform's nodes). The data in
	// them is no longer anyone's: Garage moved its own, the NATS and
	// Patroni instances rebuild theirs elsewhere, and the rest (pgadmin4,
	// pipelines...) started on other nodes during the drain.
	if nodeClient, ok := pt.DCMap[view.Address()]; ok && nodeClient != nil {
		removeNodeLeftovers(pd, nodeClient, view.Hostname(), logger)
	}

	// The node leaves from its own side first. A NodeRemove against a
	// node that is still a swarm member is refused unless it is already
	// down, and forcing it leaves the machine believing it is still in
	// a swarm it has been evicted from — which is a mess to undo by
	// hand later.
	if nodeClient, ok := pt.DCMap[view.Address()]; ok {
		logger.Printf("Taking %s out of the swarm...", view.Hostname())
		if err := nodeLeaveSwarm(nodeClient); err != nil {
			return fmt.Errorf("error leaving the swarm on %s: %w", view.Hostname(), err)
		}
	} else {
		logger.Printf("No connection to %s, so it cannot leave the swarm cleanly; "+
			"removing it from the manager's side.", view.Hostname())
	}

	if err := manager.Cli.NodeRemove(manager.Ctx, view.Node.ID,
		types.NodeRemoveOptions{Force: true}); err != nil {
		return fmt.Errorf("error removing %s from the swarm: %w", view.Hostname(), err)
	}

	remaining := make([]pt.NodeData, 0, len(pd.PlatformInfo.NodesData))
	for _, node := range pd.PlatformInfo.NodesData {
		if sameNode(node, view.Platform) {
			continue
		}
		remaining = append(remaining, node)
	}
	pd.PlatformInfo.NodesData = remaining
	pd.PlatformInfo.NumberOfSwarmNodes = len(remaining)

	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return fmt.Errorf("error saving the state file: %w", err)
	}

	// Rewritten now rather than left for the next init. The placement
	// labels on the surviving nodes no longer match what NodesData
	// implies, and leaving the two disagreeing means the shift happens
	// later, unannounced, in the middle of an unrelated `run`.
	//
	// Reset for the same reason as in AddNodeToPlatform: the map still
	// holds a client for the node that has just left, and the sync.Once
	// means a plain SetDockerClientsMap would not notice.
	if err := ResetDockerClientsMap(); err != nil {
		return fmt.Errorf("error closing the docker clients: %w", err)
	}
	if _, err := SetDockerClientsMap(pd, "update"); err != nil {
		return fmt.Errorf("error reconnecting to the remaining nodes: %w", err)
	}
	logger.Printf("Reassigning placement labels across the remaining nodes...")
	if err := addNodesLabels(pd); err != nil {
		return fmt.Errorf("error reassigning the node labels: %w", err)
	}

	return nil
}

// removeNodeLeftovers removes, from a drained node, the stopped
// containers of its Swarm tasks (Docker keeps a few per service as task
// history, and they hold their volumes) and then the platform's volumes.
// Best effort: a failure is reported with what to remove by hand, and
// does not stop the removal.
func removeNodeLeftovers(pd *pt.PlatformData, dc *pt.DockerClient, hostname string, logger *log.Logger) {
	f := filters.NewArgs()
	f.Add("label", "com.docker.swarm.task.id")
	containers, err := dc.Cli.ContainerList(dc.Ctx, container.ListOptions{All: true, Filters: f})
	if err == nil {
		for _, c := range containers {
			if c.State == "running" {
				continue
			}
			_ = dc.Cli.ContainerRemove(dc.Ctx, c.ID, container.RemoveOptions{Force: true, RemoveVolumes: true})
		}
	}

	removed, err := volumes.RemoveNodeVolumes(pd, dc)
	if len(removed) > 0 {
		logger.Printf("Removed the platform's volumes on %s: %s", hostname, strings.Join(removed, ", "))
	}
	if err != nil {
		logger.Printf("Warning: %v on %s; remove them by hand there with 'docker volume rm'.", err, hostname)
	}
}

// waitForNodeDrained waits until nothing is running on the node.
func waitForNodeDrained(dc *pt.DockerClient, nodeID string, logger *log.Logger) error {
	const attempts = 60

	for attempt := 1; attempt <= attempts; attempt++ {
		tasks, err := ListNodeTasks(dc, nodeID, false)
		if err != nil {
			return err
		}

		running := 0
		for _, task := range tasks {
			if task.Status.State == swarm.TaskStateRunning {
				running++
			}
		}
		if running == 0 {
			return nil
		}

		if attempt%5 == 0 {
			logger.Printf("  %d task(s) still moving off the node...", running)
		}
		time.Sleep(2 * time.Second)
	}

	// Not fatal. Something pinned to this node by a constraint the
	// drain cannot satisfy will never move, and saying so beats hanging
	// forever or pretending it worked.
	logger.Printf("Warning: some tasks are still on the node after two minutes. " +
		"They are probably pinned there by a placement constraint and will be killed.")
	return nil
}

// sameNode matches two NodesData entries. The address is the identity
// used everywhere else in this CLI — DCMap is keyed on it — so it is
// the one used here.
func sameNode(a, b pt.NodeData) bool {
	if a.NodeIP == "" || b.NodeIP == "" {
		return false
	}
	return a.NodeIP == b.NodeIP
}

// nodeName is the friendliest handle a node has.
func nodeName(node pt.NodeData) string {
	if node.NodeLabel != "" {
		return node.NodeLabel
	}
	if node.NodeHostName != "" {
		return node.NodeHostName
	}
	return node.NodeIP
}

// DescribeRemoval renders a removal plan for the operator to agree to.
func DescribeRemoval(impact NodePlacementImpact, target pt.NodeData) string {
	return describeRemoval(impact, target) + impact.garageNote()
}

func (impact NodePlacementImpact) garageNote() string {
	if len(impact.GarageInstances) == 0 {
		return ""
	}
	return fmt.Sprintf("  Garage: %s will be moved to the other nodes first, one at a time "+
		"(each copies a full replica of the data).\n", instanceNames(impact.GarageInstances))
}

func describeRemoval(impact NodePlacementImpact, target pt.NodeData) string {
	var b strings.Builder

	fmt.Fprintf(&b, "Removing %s (%s)\n", nodeName(target), target.NodeRole)

	if impact.ManagersBefore != impact.ManagersAfter {
		needed := impact.ManagersAfter/2 + 1
		fmt.Fprintf(&b, "  Managers go from %d to %d, so quorum becomes %d.\n",
			impact.ManagersBefore, impact.ManagersAfter, needed)
		if impact.ManagersAfter == 0 {
			b.WriteString("  That is no managers at all: the swarm would stop working.\n")
		} else if impact.ManagersAfter%2 == 0 {
			b.WriteString("  An even number of managers buys no extra tolerance. Use 1, 3 or 5.\n")
		}
	}

	single := map[string]bool{}
	for _, inst := range impact.SingleCopies {
		single[inst] = true
	}
	for _, m := range impact.Moves {
		if single[m.Instance] {
			fmt.Fprintf(&b, "  %s moves to %s and starts there EMPTY (it was the only copy): "+
				"restore it from its backup afterwards.\n", m.Instance, m.To)
			continue
		}
		fmt.Fprintf(&b, "  %s moves to %s and rebuilds its data there from the other instances.\n",
			m.Instance, m.To)
	}

	return b.String()
}
