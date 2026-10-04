package docker

import (
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/docker/docker/api/types/swarm"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// How the node commands keep Garage whole.
//
//   - node add:      a new host gets its share of instances right away
//                    (RebalanceGarageAfterNodeAdd), unless the operator
//                    asks to wait.
//   - node remove:   the node's instances are moved off it BEFORE it is
//                    drained (see RemoveNodeFromPlatform): a migration
//                    needs the old instance running to the end.
//   - node drain:    refused when Garage would lose its quorum
//                    (GarageDrainBlocker). A drained node's instances just
//                    wait, pinned to it, with their volumes.
//   - node activate: those instances come back with their data and catch
//                    up on their own; nothing to rebalance.

// GarageInstancesOn lists the IDs of the instances pinned to a node.
func GarageInstancesOn(pi pt.PlatformInfo, nodeIP string) []int {
	var ids []int
	for _, inst := range pi.GarageInstances {
		if inst.NodeIP == nodeIP {
			ids = append(ids, inst.ID)
		}
	}
	sort.Ints(ids)
	return ids
}

func instanceNames(ids []int) string {
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		names = append(names, utils.GarageInstanceServiceName(id))
	}
	return strings.Join(names, ", ")
}

// GarageDrainBlocker returns why draining target would leave Garage
// without quorum, or "" if it would not. Every node that is drained,
// paused or down counts as unavailable as well: draining a second node
// while a first one is under maintenance is exactly the case to catch.
func GarageDrainBlocker(pd *pt.PlatformData, target NodeView, all []NodeView) string {
	unavailable := map[string]string{} // ip -> hostname
	for _, v := range all {
		if v.Address() == target.Address() {
			continue
		}
		if v.Availability() != string(swarm.NodeAvailabilityActive) || v.State() != string(swarm.NodeStateReady) {
			unavailable[v.Address()] = v.Hostname()
		}
	}
	return garageDrainBlocker(pd.PlatformInfo, target.Address(), target.Hostname(), unavailable)
}

// garageDrainBlocker is GarageDrainBlocker on plain data.
//
// The rule follows from how instances are spread. With exactly as many
// instances as the replication factor (3), every instance holds every
// object, so what counts is how many stay up: at least 2. With more,
// there is one instance per node and Garage puts the 3 copies of each
// object in 3 different zones (nodes), so at most one node with
// instances may be unavailable at a time.
func garageDrainBlocker(pi pt.PlatformInfo, targetIP, targetName string, unavailable map[string]string) string {
	if !utils.IsGarage(pi) {
		return ""
	}
	onTarget := GarageInstancesOn(pi, targetIP)
	if len(onTarget) == 0 {
		return ""
	}

	n := len(pi.GarageInstances)
	rf := utils.GarageReplicationFactor(pi)
	quorum := rf/2 + 1

	down := len(onTarget)
	var alreadyDown []string
	for ip, name := range unavailable {
		if ids := GarageInstancesOn(pi, ip); len(ids) > 0 {
			down += len(ids)
			alreadyDown = append(alreadyDown, name)
		}
	}
	sort.Strings(alreadyDown)

	lost := false
	if n <= rf {
		lost = n-down < quorum
	} else {
		lost = len(alreadyDown)+1 > rf-quorum
	}
	if !lost {
		return ""
	}

	msg := fmt.Sprintf("Cannot drain %s: it runs %s, and without %s the object store (Garage) "+
		"would lose its quorum — S3 reads and writes would stop: no WAL archiving, no "+
		"pipelines output, no backups.\n", targetName, instanceNames(onTarget), pluralIt(len(onTarget)))

	if len(alreadyDown) > 0 {
		msg += fmt.Sprintf("Garage instances are already unavailable on %s: bring that back first "+
			"(osi4iot node activate %s).", strings.Join(alreadyDown, ", "), alreadyDown[0])
		return msg
	}

	if rf == 1 {
		return msg + "This platform has a single Garage instance. For maintenance on this node, " +
			"stop the platform (osi4iot stop), do the work, and start it again (osi4iot run); " +
			"the data is kept."
	}

	// How many more workers would leave the target with at most one
	// instance, once rebalanced.
	hosts := len(utils.GarageHostIPs(pi))
	need := rf - hosts
	if need < 1 {
		need = 1
	}
	return msg + fmt.Sprintf("To keep the platform running during maintenance, add %d platform "+
		"worker(s) (osi4iot node add): Garage then spreads its instances one per worker and "+
		"this node can be drained. Otherwise, stop the platform (osi4iot stop), do the work, "+
		"and start it again (osi4iot run); the data is kept.", need)
}

func pluralIt(n int) string {
	if n == 1 {
		return "it"
	}
	return "them"
}

// RebalanceGarageAfterNodeAdd spreads Garage onto a newly added node when
// it is one Garage may use. skip leaves the cluster as it is and says how
// to rebalance later.
func RebalanceGarageAfterNodeAdd(pd *pt.PlatformData, dc *pt.DockerClient, node pt.NodeData, skip bool, logger *log.Logger) error {
	pi := pd.PlatformInfo
	if !utils.IsGarage(pi) || utils.GarageReplicationFactor(pi) < 2 {
		return nil
	}
	isHost := false
	for _, ip := range utils.GarageHostIPs(pi) {
		if ip == node.NodeIP {
			isHost = true
		}
	}
	if !isHost || len(utils.PlanGarageRebalance(pi, utils.GarageHostIPs(pi))) == 0 {
		return nil
	}
	if skip {
		logger.Printf("Garage is not evenly spread over the workers any more. Rebalance it when " +
			"convenient: osi4iot service rebalance garage")
		return nil
	}
	logger.Printf("Rebalancing Garage onto the new worker (each move copies a full replica; " +
		"if interrupted, 'osi4iot service rebalance garage' resumes it)...")
	return RebalanceGarage(pd, dc, logger)
}

// GarageActivateNote tells the operator what happens to Garage when a
// drained node comes back.
func GarageActivateNote(pi pt.PlatformInfo, nodeIP string) string {
	ids := GarageInstancesOn(pi, nodeIP)
	if len(ids) == 0 {
		return ""
	}
	return fmt.Sprintf("%s restart on this node with their data and catch up on what was "+
		"written meanwhile; no rebalancing is needed.", instanceNames(ids))
}
