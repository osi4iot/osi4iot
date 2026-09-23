package docker

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/swarm"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// Joining a machine to the platform and taking one out.
//
// # A node is more than a swarm member here
//
// It is an entry in NodesData, an SSH target with the platform's key
// installed, and — this is the part that bites
// — a slot in the placement scheme.
//
// addNodesLabels walks NodesData IN ORDER and hands out admin-id,
// metrics-id and nats_N to the "Platform worker" nodes as it goes. The
// labels are positional, so the list's order is load-bearing:
//
//   - APPENDING a node changes nothing for the nodes already there. The
//     counters reach them first and give them the same numbers.
//   - REMOVING one from the middle shifts every worker after it. The
//     machine that had admin-id=2 becomes admin-id=1, so the
//     patroni_admin1 service reschedules onto it, finds no
//     patroni_admin1-data volume there, and Patroni rebuilds that
//     replica from the leader.
//
// That shift is survivable but expensive, and there is a case where it
// is worse than expensive: if the platform is left with fewer workers
// than NumPatroniAdminNodes, the highest admin-id is on no machine at
// all and that Patroni service becomes unschedulable. Nothing reports
// it — the service simply sits with a pending task forever.
//
// So removal checks the arithmetic first and refuses when it does not
// work out, rather than leaving the operator to discover it.

// NodePlacementImpact describes what adding or removing a node does to
// the placement scheme.
type NodePlacementImpact struct {
	WorkersBefore int
	WorkersAfter  int

	// ShiftedWorkers are the nodes whose placement labels change
	// because a node earlier in the list went away.
	ShiftedWorkers []string

	// HomelessServices are services that would have no node carrying
	// their placement label afterwards. A non-empty list is a refusal.
	HomelessServices []string

	// ManagersBefore / ManagersAfter matter for quorum.
	ManagersBefore int
	ManagersAfter  int
}

// PlanNodeRemoval works out what removing this node would do, without
// doing any of it.
func PlanNodeRemoval(pd *pt.PlatformData, target pt.NodeData) NodePlacementImpact {
	pi := pd.PlatformInfo
	impact := NodePlacementImpact{}

	removed := false
	workerIndex := 0
	for _, node := range pi.NodesData {
		if node.NodeRole == "Manager" {
			impact.ManagersBefore++
		}
		if node.NodeRole != "Platform worker" {
			if sameNode(node, target) {
				removed = true
			}
			continue
		}

		impact.WorkersBefore++
		if sameNode(node, target) {
			removed = true
			continue
		}

		workerIndex++
		impact.WorkersAfter++

		// A worker that sits after the removed one gets a different
		// number than it has now, which is what makes its services move.
		if removed {
			impact.ShiftedWorkers = append(impact.ShiftedWorkers, nodeName(node))
		}
	}

	impact.ManagersAfter = impact.ManagersBefore
	if target.NodeRole == "Manager" {
		impact.ManagersAfter--
	}

	// Which services would be left pointing at a label nobody carries.
	if pi.UsePatroniTool {
		if pi.NumPatroniAdminNodes > 1 {
			for i := impact.WorkersAfter + 1; i <= pi.NumPatroniAdminNodes; i++ {
				impact.HomelessServices = append(impact.HomelessServices,
					fmt.Sprintf("patroni_admin%d", i))
			}
		}
		if pi.NumPatroniMetricsNodes > 1 {
			for i := impact.WorkersAfter + 1; i <= pi.NumPatroniMetricsNodes; i++ {
				impact.HomelessServices = append(impact.HomelessServices,
					fmt.Sprintf("patroni_metrics%d", i))
			}
		}
	}
	for i := impact.WorkersAfter + 1; i <= pi.DefaultNumOfNatsReplicas; i++ {
		impact.HomelessServices = append(impact.HomelessServices, fmt.Sprintf("nats%d", i))
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

	// Rebuilt so the new node has a Docker client: joinAllNodesToSwarm
	// and nodesConfiguration both drive off DCMap, not off NodesData.
	if err := CloseDockerClientsMap(); err != nil {
		return fmt.Errorf("error closing the docker clients: %w", err)
	}
	if _, err := SetDockerClientsMap(pd, "update"); err != nil {
		return fmt.Errorf("error connecting to %s: %w\n"+
			"The node is in the state file now, so fix the machine and run this again",
			node.NodeIP, err)
	}

	manager, err := GetManagerDC()
	if err != nil {
		return fmt.Errorf("error getting the manager docker client: %w", err)
	}

	// Whole-platform rather than node-specific, and idempotent: it
	// installs UFW and RexRay where they are missing and rewrites
	// every node's labels from NodesData. Re-running it on the nodes
	// that are already configured costs time and changes nothing.
	logger.Printf("Configuring %s (firewall, volume plugin, labels)...", node.NodeIP)
	if err := nodesConfiguration(pd); err != nil {
		return fmt.Errorf("error configuring the nodes: %w", err)
	}

	logger.Printf("Joining %s to the swarm...", node.NodeIP)
	if err := joinAllNodesToSwarm(manager); err != nil {
		return fmt.Errorf("error joining the node to the swarm: %w", err)
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

	if view.Availability() != string(swarm.NodeAvailabilityDrain) {
		logger.Printf("Draining %s...", view.Hostname())
		if err := SetNodeAvailability(manager, view, swarm.NodeAvailabilityDrain); err != nil {
			return err
		}
		if err := waitForNodeDrained(manager, view.Node.ID, logger); err != nil {
			return err
		}
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
	if err := CloseDockerClientsMap(); err != nil {
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

	if len(impact.ShiftedWorkers) > 0 {
		fmt.Fprintf(&b, "  Placement labels shift on %d node(s): %s.\n",
			len(impact.ShiftedWorkers), strings.Join(impact.ShiftedWorkers, ", "))
		b.WriteString("  The Patroni and NATS replicas pinned to those labels move with them, " +
			"onto\n  machines with no data for that replica, and rebuild from their leader.\n")
	}

	return b.String()
}