package cmd

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/docker/docker/api/types/swarm"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/docker"
)

// What draining a node costs the clustered services pinned to nodes by
// label — NATS (nats_N) and the two Patroni clusters (admin-id=N,
// metrics-id=N). Their instance on the node cannot move: it stops while
// the node is drained and comes back with its data on 'node activate'.
// Like Garage's (GarageDrainBlocker), the drain is refused when the
// service would lose its quorum, counting nodes already drained or down.

// pinnedFamily is one clustered service pinned to nodes by label.
type pinnedFamily struct {
	service string         // as the operator knows it
	tag     *regexp.Regexp // the node's placement tag; group 1 is the instance number
	prefix  string         // instance name = prefix + number
	// What the quorum is called, what losing it means, and what stopping
	// one instance does when the quorum holds.
	quorumOf, lostMeans, oneStops string
}

var pinnedFamilies = []pinnedFamily{
	{
		service:  "NATS",
		tag:      regexp.MustCompile(`^nats_(\d+)$`),
		prefix:   "nats",
		quorumOf: "JetStream's quorum",
		lostMeans: "streams would stop storing messages, and what devices and pipelines send " +
			"meanwhile would be lost",
		oneStops: "clients connected to it reconnect to the other servers, and any stream or " +
			"JetStream leadership it holds moves to one of them",
	},
	{
		service:   "patroni_admin",
		tag:       regexp.MustCompile(`^admin-id=(\d+)$`),
		prefix:    "patroni_admin",
		quorumOf:  "its Raft quorum",
		lostMeans: "the cluster would have no leader and the platform's database would stop accepting writes",
		oneStops:  "if it is the leader, another node takes over (a failover: writes pause for a few seconds)",
	},
	{
		service:   "patroni_metrics",
		tag:       regexp.MustCompile(`^metrics-id=(\d+)$`),
		prefix:    "patroni_metrics",
		quorumOf:  "its Raft quorum",
		lostMeans: "the cluster would have no leader and the metrics database would stop accepting writes",
		oneStops:  "if it is the leader, another node takes over (a failover: writes pause for a few seconds)",
	},
}

// drainNode is what the rule needs of a node.
type drainNode struct {
	name      string
	tags      []string
	available bool // active and ready: its pinned instances run
}

func drainNodeOf(v docker.NodeView) drainNode {
	return drainNode{
		name: v.Hostname(),
		tags: v.PlacementTags,
		available: v.Availability() == string(swarm.NodeAvailabilityActive) &&
			v.State() == string(swarm.NodeStateReady),
	}
}

func (f pinnedFamily) instancesOn(n drainNode) []string {
	var out []string
	for _, t := range n.tags {
		if m := f.tag.FindStringSubmatch(t); m != nil {
			out = append(out, f.prefix+m[1])
		}
	}
	return out
}

// pinnedDrainImpact returns, for draining target, one warning per pinned
// service with an instance on it, and the reason to refuse the drain
// ("" if none).
func pinnedDrainImpact(target drainNode, others []drainNode) (warnings []string, blocker string) {
	var blockers []string
	for _, f := range pinnedFamilies {
		onTarget := f.instancesOn(target)
		if len(onTarget) == 0 {
			continue
		}
		total, down := len(onTarget), 0
		var downNodes []string
		for _, o := range others {
			ids := f.instancesOn(o)
			total += len(ids)
			if !o.available && len(ids) > 0 {
				down += len(ids)
				downNodes = append(downNodes, o.name)
			}
		}
		sort.Strings(downNodes)
		names := strings.Join(onTarget, ", ")
		remaining := total - len(onTarget) - down
		quorum := total/2 + 1

		switch {
		case total == len(onTarget):
			warnings = append(warnings, fmt.Sprintf(
				"This node runs %s, the only %s instance: draining it stops %s until the node is activated again.",
				names, f.service, f.service))
		case remaining >= quorum:
			warnings = append(warnings, fmt.Sprintf(
				"This node runs %s, pinned here: it stops while the node is drained and comes back "+
					"with its data on 'node activate'. %s keeps working with %d of %d instances "+
					"(%d needed for %s); %s.",
				names, f.service, remaining, total, quorum, f.quorumOf, f.oneStops))
		default:
			msg := fmt.Sprintf("Cannot drain %s: it runs %s, and without it %s would keep %d of %d "+
				"instances, fewer than the %d %s needs — %s.",
				target.name, names, f.service, remaining, total, quorum, f.quorumOf, f.lostMeans)
			if len(downNodes) > 0 {
				msg += fmt.Sprintf("\n%s instances are already unavailable on %s: bring that back "+
					"first (osi4iot node activate %s).", f.service, strings.Join(downNodes, ", "), downNodes[0])
			} else {
				msg += fmt.Sprintf("\n%s has too few instances to lose one: scale it up first, or "+
					"stop the platform for the maintenance.", f.service)
			}
			blockers = append(blockers, msg)
		}
	}
	return warnings, strings.Join(blockers, "\n\n")
}
