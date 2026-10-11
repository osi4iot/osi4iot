package docker

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Placement numbers of NATS and Patroni: nats_N=true, admin-id=N and
// metrics-id=N on the platform workers. Instance N of each service is
// pinned to the worker carrying number N, and its data lives in a local
// volume on that worker.
//
// The numbers are STABLE: a worker keeps the ones it has for as long as
// they are still in range (1..number of workers), and only the numbers
// nobody holds are handed out — lowest first, to the workers holding
// none, in NodesData order. So removing a worker moves only what was on
// it: its number goes to a spare worker (the one that held the highest
// number, now out of range), and that one instance rebuilds its data
// there from the others.
//
// They used to be handed out by position in NodesData, which renumbered
// every worker after a removed one. With four workers and three
// replicas, removing the first moved ALL THREE replicas of each service
// onto machines without their data at once — for Patroni, three empty
// nodes: a brand-new empty database.

// pinnedLabelFamily is how one service's number is written on a node.
type pinnedLabelFamily struct {
	service string // "nats", "patroni_admin", "patroni_metrics"
	prefix  string // instance name = prefix + N
	read    func(labels map[string]string) []int
	write   func(labels map[string]string, id int)
}

var (
	natsLabelFamily = pinnedLabelFamily{
		service: "nats", prefix: "nats",
		read: func(labels map[string]string) []int {
			var ids []int
			for k, v := range labels {
				if rest, ok := strings.CutPrefix(k, "nats_"); ok && v == "true" {
					if n, err := strconv.Atoi(rest); err == nil && n > 0 {
						ids = append(ids, n)
					}
				}
			}
			sort.Ints(ids)
			return ids
		},
		write: func(labels map[string]string, id int) { labels[fmt.Sprintf("nats_%d", id)] = "true" },
	}
	patroniAdminLabelFamily   = valueLabelFamily("patroni_admin", "admin-id")
	patroniMetricsLabelFamily = valueLabelFamily("patroni_metrics", "metrics-id")
)

// valueLabelFamily is a family written as key=N.
func valueLabelFamily(service, key string) pinnedLabelFamily {
	return pinnedLabelFamily{
		service: service, prefix: service,
		read: func(labels map[string]string) []int {
			if n, err := strconv.Atoi(labels[key]); err == nil && n > 0 {
				return []int{n}
			}
			return nil
		},
		write: func(labels map[string]string, id int) { labels[key] = strconv.Itoa(id) },
	}
}

// pinnedFamily with its configured replica count.
type pinnedTarget struct {
	family   pinnedLabelFamily
	replicas int
}

// pinnedTargets lists the families the platform pins, with their replica
// counts (resources.PlacementTargets decides which: Patroni only with
// the Patroni tool).
func pinnedTargets(pd *pt.PlatformData) []pinnedTarget {
	var out []pinnedTarget
	for _, t := range resources.PlacementTargets(pd) {
		switch t.Service {
		case "nats":
			out = append(out, pinnedTarget{natsLabelFamily, t.Replicas})
		case "patroni_admin":
			out = append(out, pinnedTarget{patroniAdminLabelFamily, t.Replicas})
		case "patroni_metrics":
			out = append(out, pinnedTarget{patroniMetricsLabelFamily, t.Replicas})
		}
	}
	return out
}

// PinnedReplicas is the replica count of each pinned service ("nats",
// "patroni_admin", "patroni_metrics"); a service the platform does not
// pin is absent.
func PinnedReplicas(pd *pt.PlatformData) map[string]int {
	out := map[string]int{}
	for _, t := range pinnedTargets(pd) {
		out[t.family.service] = t.replicas
	}
	return out
}

// assignPinnedIDs gives each worker (in order) its number 1..len(workers):
// the one it holds if still in range and nobody earlier holds it, else
// the lowest number nobody holds. current is each worker's numbers now.
func assignPinnedIDs(workers []string, current map[string][]int) map[string]int {
	maxID := len(workers)
	out := make(map[string]int, len(workers))
	taken := map[int]bool{}
	for _, w := range workers {
		for _, id := range current[w] {
			if id <= maxID && !taken[id] {
				out[w] = id
				taken[id] = true
				break
			}
		}
	}
	next := 1
	for _, w := range workers {
		if _, ok := out[w]; ok {
			continue
		}
		for taken[next] {
			next++
		}
		out[w] = next
		taken[next] = true
	}
	return out
}

// currentPinnedIDs reads one family's numbers off every worker's labels.
func currentPinnedIDs(f pinnedLabelFamily, workers []string, labels map[string]map[string]string) map[string][]int {
	cur := make(map[string][]int, len(workers))
	for _, w := range workers {
		cur[w] = f.read(labels[w])
	}
	return cur
}

// pinnedMove is one instance that changes worker.
type pinnedMove struct {
	Instance string
	From, To string // node IPs (PlanNodeRemoval turns them into node names); From "" if nobody held it
}

// planPinnedMoves says which instances (1..replicas) change worker when
// the platform workers go from before to after, labels being each
// node's labels now (by IP).
func planPinnedMoves(targets []pinnedTarget, before, after []string, labels map[string]map[string]string) []pinnedMove {
	var moves []pinnedMove
	for _, t := range targets {
		was := holders(assignPinnedIDs(before, currentPinnedIDs(t.family, before, labels)))
		will := holders(assignPinnedIDs(after, currentPinnedIDs(t.family, after, labels)))
		for id := 1; id <= t.replicas; id++ {
			if to, ok := will[id]; ok && was[id] != to {
				moves = append(moves, pinnedMove{Instance: fmt.Sprintf("%s%d", t.family.prefix, id), From: was[id], To: to})
			}
		}
	}
	return moves
}

func holders(assigned map[string]int) map[int]string {
	out := make(map[int]string, len(assigned))
	for w, id := range assigned {
		out[id] = w
	}
	return out
}
