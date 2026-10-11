package utils

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// The platform's Garage is a cluster of instances, garage_1..N, each a
// Swarm service pinned to one node by the label garage_<ID>=true, with
// its own garage_meta_<ID> / garage_data_<ID> volumes.
//
// # Replication factor
//
// Fixed at creation and never changed: 1 for "Local deployment", 3 for
// the cluster deployments. Garage does not support changing it on a
// cluster that holds data (it means deleting the layout everywhere and
// rebuilding it). Scaling and rebalancing change how many instances
// there are and where, never the replication factor.
//
// # Identity
//
// Each instance's Garage identity (node_key) is generated here and kept
// in the state file. Every node ID is therefore known before any
// instance starts, so garage.toml lists them all as bootstrap peers and
// the first layout can name every node at once — no discovery step.
// Go's ed25519 private keys have exactly the layout Garage (libsodium)
// stores: the 32-byte seed followed by the 32-byte public key.
//
// # Clients
//
// Every instance carries the network alias "garage" on internal_net, in
// DNS round-robin mode: http://garage:3900 reaches any healthy instance,
// and any instance serves any request.

const (
	// GarageClusterReplicationFactor is the replication factor of the
	// cluster deployments.
	GarageClusterReplicationFactor = 3
	// GarageNodeCapacity is the capacity every node is given in the
	// layout. Garage uses capacities only as relative weights between
	// nodes; equal weights spread the partitions evenly. 1 TB.
	GarageNodeCapacity int64 = 1000000000000
)

var garageInstanceServiceRe = regexp.MustCompile(`^garage_(\d+)$`)

// GarageInstanceServiceName is the Swarm service of an instance.
func GarageInstanceServiceName(id int) string { return fmt.Sprintf("garage_%d", id) }

// GarageInstanceLabel is the node label pinning an instance.
func GarageInstanceLabel(id int) string { return fmt.Sprintf("garage_%d", id) }

// GarageMetaVolumeName and GarageDataVolumeName are an instance's volumes.
func GarageMetaVolumeName(id int) string { return fmt.Sprintf("garage_meta_%d", id) }
func GarageDataVolumeName(id int) string { return fmt.Sprintf("garage_data_%d", id) }

// GarageInstanceIDFromService parses "garage_<ID>"; ok is false for any
// other name — garage_webui included.
func GarageInstanceIDFromService(name string) (int, bool) {
	m := garageInstanceServiceRe.FindStringSubmatch(name)
	if m == nil {
		return 0, false
	}
	id, err := strconv.Atoi(m[1])
	return id, err == nil
}

// GarageReplicationFactorFor is the replication factor a platform gets
// at creation, from its deployment location.
func GarageReplicationFactorFor(pi osi_types.PlatformInfo) int {
	if pi.DeploymentLocation == "Local deployment" {
		return 1
	}
	return GarageClusterReplicationFactor
}

// GarageReplicationFactor is the platform's replication factor: the one
// fixed at creation, or the one it would get if not fixed yet.
func GarageReplicationFactor(pi osi_types.PlatformInfo) int {
	if pi.GarageReplicationFactor > 0 {
		return pi.GarageReplicationFactor
	}
	return GarageReplicationFactorFor(pi)
}

// GarageHosts lists the nodes Garage instances may run on, in the
// state file's order: the platform workers, or the managers on a
// platform that has none (where everything runs on the managers).
func GarageHosts(pi osi_types.PlatformInfo) []osi_types.NodeData {
	var workers, managers []osi_types.NodeData
	for _, node := range pi.NodesData {
		switch node.NodeRole {
		case "Platform worker":
			workers = append(workers, node)
		case "Manager":
			managers = append(managers, node)
		}
	}
	if len(workers) > 0 {
		return workers
	}
	return managers
}

// GarageDistribution spreads n instances over the hosts as evenly as
// possible: counts differ by at most one, and the extra ones go to the
// hosts listed first. 1 host: [3]; 2 hosts: [2 1]; 3 hosts: [1 1 1].
func GarageDistribution(hosts []string, n int) map[string]int {
	counts := make(map[string]int, len(hosts))
	if len(hosts) == 0 {
		return counts
	}
	for i := 0; i < n; i++ {
		counts[hosts[i%len(hosts)]]++
	}
	return counts
}

// GarageNodeID is an instance's Garage node ID: its public key, hex.
func GarageNodeID(inst osi_types.GarageInstance) string {
	key, err := hex.DecodeString(inst.NodeKey)
	if err != nil || len(key) != ed25519.PrivateKeySize {
		return ""
	}
	return hex.EncodeToString(key[ed25519.SeedSize:])
}

// GarageNodeKeyBytes is the node_key file Garage reads: 64 raw bytes.
func GarageNodeKeyBytes(inst osi_types.GarageInstance) ([]byte, error) {
	key, err := hex.DecodeString(inst.NodeKey)
	if err != nil || len(key) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("garage_%d has an invalid node key in the state file", inst.ID)
	}
	return key, nil
}

// GenerateGarageNodeKey returns a new Garage identity, hex encoded.
func GenerateGarageNodeKey() string {
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		panic(fmt.Sprintf("crypto/rand failed: %v", err))
	}
	return hex.EncodeToString(priv)
}

// GarageZone is the layout zone of the instances on a node: one zone per
// node, so that with three or more nodes Garage keeps the three copies
// of every object on three different machines.
func GarageZone(pi osi_types.PlatformInfo, nodeIP string) string {
	for _, node := range pi.NodesData {
		if node.NodeIP == nodeIP && node.NodeHostName != "" {
			return sanitizeZone(node.NodeHostName)
		}
	}
	return sanitizeZone("node-" + nodeIP)
}

func sanitizeZone(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	return b.String()
}

// NewGarageInstance appends an instance pinned to nodeIP, with a fresh
// identity and the lowest ID not in use, and returns it.
//
// IDs are reused once their instance is gone, so names stay within
// garage_1..N+1 however many moves there have been. During a move the
// old instance still exists, so its replacement takes another number
// (garage_3 → garage_4); the next move can take 3 again.
//
// Reuse is safe: an ID names a service, two volumes and a node label,
// all removed with the instance, and the identity is new. Should old
// volumes with the same number survive on some other node (one that was
// unreachable when the instance was retired), the image's entrypoint
// refuses to start over them: they hold a different node identity.
func NewGarageInstance(pi *osi_types.PlatformInfo, nodeIP string) osi_types.GarageInstance {
	used := map[int]bool{}
	for _, existing := range pi.GarageInstances {
		used[existing.ID] = true
	}
	id := 1
	for used[id] {
		id++
	}
	inst := osi_types.GarageInstance{
		ID:      id,
		NodeIP:  nodeIP,
		NodeKey: GenerateGarageNodeKey(),
	}
	pi.GarageInstances = append(pi.GarageInstances, inst)
	return inst
}

// EnsureGarageInstances fixes the replication factor and creates the
// first instances of a platform that has none, spread evenly over
// GarageHosts. Returns whether the state changed. Does nothing once
// instances exist: from then on they change only through scaling and
// rebalancing.
func EnsureGarageInstances(pi *osi_types.PlatformInfo) (bool, error) {
	if !IsGarage(*pi) {
		return false, nil
	}
	changed := false
	if pi.GarageReplicationFactor == 0 {
		pi.GarageReplicationFactor = GarageReplicationFactorFor(*pi)
		changed = true
	}
	if len(pi.GarageInstances) > 0 {
		return changed, nil
	}

	hosts := GarageHosts(*pi)
	if len(hosts) == 0 {
		return changed, fmt.Errorf("the platform has no nodes to run Garage on")
	}
	ips := make([]string, 0, len(hosts))
	for _, h := range hosts {
		ips = append(ips, h.NodeIP)
	}
	counts := GarageDistribution(ips, pi.GarageReplicationFactor)
	// Created host by host, in host order, so IDs follow the nodes.
	for _, ip := range ips {
		for i := 0; i < counts[ip]; i++ {
			NewGarageInstance(pi, ip)
		}
	}
	return true, nil
}

// GarageInstancesSorted returns the instances ordered by ID.
func GarageInstancesSorted(pi osi_types.PlatformInfo) []osi_types.GarageInstance {
	out := append([]osi_types.GarageInstance(nil), pi.GarageInstances...)
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// GaragePrimaryInstance is the instance that runs the provisioning
// (keys, bucket, the first layout): the one with the lowest ID.
func GaragePrimaryInstance(pi osi_types.PlatformInfo) (osi_types.GarageInstance, bool) {
	sorted := GarageInstancesSorted(pi)
	if len(sorted) == 0 {
		return osi_types.GarageInstance{}, false
	}
	return sorted[0], true
}

// GarageBootstrapPeers lists every instance as "<node ID>@garage_<ID>:3901".
// Each instance finds its own entry there too, which Garage skips.
func GarageBootstrapPeers(pi osi_types.PlatformInfo) []string {
	var peers []string
	for _, inst := range GarageInstancesSorted(pi) {
		if id := GarageNodeID(inst); id != "" {
			peers = append(peers, fmt.Sprintf("%s@%s:%d", id, GarageInstanceServiceName(inst.ID), GarageRPCPort))
		}
	}
	return peers
}

// GarageHostIPs is GarageHosts' addresses, in order.
func GarageHostIPs(pi osi_types.PlatformInfo) []string {
	hosts := GarageHosts(pi)
	ips := make([]string, 0, len(hosts))
	for _, h := range hosts {
		ips = append(ips, h.NodeIP)
	}
	return ips
}

// PlanGarageRebalance returns the moves that bring the instances to an
// even spread over hosts, moving as few as possible.
//
//   - Instances on a node that is not among hosts (being removed, or no
//     longer eligible) always move.
//   - The count each host should end with follows GarageDistribution,
//     but the larger shares go to the hosts that already hold the most
//     instances, so nothing moves just to change which host has the
//     extra one.
//   - From a host with too many, the highest IDs leave first; hosts that
//     need instances are filled in host order.
//
// The number of instances never changes here — only where they run.
func PlanGarageRebalance(pi osi_types.PlatformInfo, hosts []string) []osi_types.GarageMove {
	n := len(pi.GarageInstances)
	if n == 0 || len(hosts) == 0 {
		return nil
	}

	current := map[string][]int{}
	for _, inst := range GarageInstancesSorted(pi) {
		current[inst.NodeIP] = append(current[inst.NodeIP], inst.ID)
	}

	// Hosts by current count, most first; ties keep host order.
	order := append([]string(nil), hosts...)
	position := map[string]int{}
	for i, h := range hosts {
		position[h] = i
	}
	sort.SliceStable(order, func(i, j int) bool {
		return len(current[order[i]]) > len(current[order[j]])
	})
	desired := map[string]int{}
	base, extra := n/len(hosts), n%len(hosts)
	for i, h := range order {
		desired[h] = base
		if i < extra {
			desired[h]++
		}
	}

	// Instances that must leave: everything on a non-host, and the
	// surplus — highest IDs first — of every host.
	var leaving []osi_types.GarageInstance
	byID := map[int]osi_types.GarageInstance{}
	for _, inst := range pi.GarageInstances {
		byID[inst.ID] = inst
	}
	nodes := make([]string, 0, len(current))
	for ip := range current {
		nodes = append(nodes, ip)
	}
	sort.Strings(nodes)
	for _, ip := range nodes {
		ids := current[ip]
		keep := desired[ip] // 0 for a node that is not a host
		if len(ids) <= keep {
			continue
		}
		surplus := append([]int(nil), ids...)
		sort.Sort(sort.Reverse(sort.IntSlice(surplus)))
		for _, id := range surplus[:len(ids)-keep] {
			leaving = append(leaving, byID[id])
		}
	}
	sort.Slice(leaving, func(i, j int) bool { return leaving[i].ID > leaving[j].ID })

	// Slots to fill, in host order.
	var slots []string
	for _, h := range hosts {
		for k := len(current[h]); k < desired[h]; k++ {
			slots = append(slots, h)
		}
	}

	moves := make([]osi_types.GarageMove, 0, len(leaving))
	for i, inst := range leaving {
		if i >= len(slots) {
			break
		}
		moves = append(moves, osi_types.GarageMove{OldID: inst.ID, ToIP: slots[i]})
	}
	return moves
}

// GarageInstanceByID finds an instance.
func GarageInstanceByID(pi osi_types.PlatformInfo, id int) (osi_types.GarageInstance, bool) {
	for _, inst := range pi.GarageInstances {
		if inst.ID == id {
			return inst, true
		}
	}
	return osi_types.GarageInstance{}, false
}

// RemoveGarageInstance drops an instance from the state.
func RemoveGarageInstance(pi *osi_types.PlatformInfo, id int) {
	kept := pi.GarageInstances[:0]
	for _, inst := range pi.GarageInstances {
		if inst.ID != id {
			kept = append(kept, inst)
		}
	}
	pi.GarageInstances = kept
}

// GarageMaxInstances is how many instances a platform with these hosts
// may run: one per host once there are at least as many hosts as the
// replication factor, exactly the replication factor below that.
func GarageMaxInstances(pi osi_types.PlatformInfo, hosts []string) int {
	rf := GarageReplicationFactor(pi)
	if len(hosts) >= rf {
		return len(hosts)
	}
	return rf
}

// CheckGarageScale validates a requested number of instances.
func CheckGarageScale(pi osi_types.PlatformInfo, hosts []string, target int) error {
	rf := GarageReplicationFactor(pi)
	if rf == 1 {
		return fmt.Errorf("this is a local deployment: Garage runs a single instance " +
			"(replication factor 1) and cannot be scaled")
	}
	if target < rf {
		return fmt.Errorf("Garage needs at least %d instances: its replication factor is %d, "+
			"fixed when the platform was created", rf, rf)
	}
	if max := GarageMaxInstances(pi, hosts); target > max {
		if len(hosts) < rf {
			return fmt.Errorf("with %d platform worker(s) Garage runs exactly %d instances; "+
				"add workers to run more (one instance per worker)", len(hosts), rf)
		}
		return fmt.Errorf("at most %d instances with %d platform workers: one per worker", max, len(hosts))
	}
	return nil
}

// PlanGarageScale returns the steps that take the cluster from its
// current number of instances to target, one instance per step:
//
//   - growing: each new instance goes to the host with the fewest, in
//     host order on ties;
//   - shrinking: instances on nodes that are no longer hosts leave
//     first, then the highest ID of the host with the most.
//
// Either way the spread stays even, so no moves are needed afterwards.
// Call CheckGarageScale first.
func PlanGarageScale(pi osi_types.PlatformInfo, hosts []string, target int) []osi_types.GarageMove {
	counts := map[string]int{}
	isHost := map[string]bool{}
	for _, h := range hosts {
		counts[h] = 0
		isHost[h] = true
	}
	var remaining []osi_types.GarageInstance
	for _, inst := range GarageInstancesSorted(pi) {
		counts[inst.NodeIP]++
		remaining = append(remaining, inst)
	}

	var moves []osi_types.GarageMove
	for n := len(remaining); n < target; n++ {
		best := ""
		for _, h := range hosts {
			if best == "" || counts[h] < counts[best] {
				best = h
			}
		}
		counts[best]++
		moves = append(moves, osi_types.GarageMove{ToIP: best})
	}
	for n := len(remaining); n > target; n-- {
		// Prefer a non-host; otherwise the busiest host. Highest ID there.
		pick := -1
		for i, inst := range remaining {
			if pick == -1 {
				pick = i
				continue
			}
			cur, best := remaining[i], remaining[pick]
			curOff, bestOff := !isHost[cur.NodeIP], !isHost[best.NodeIP]
			switch {
			case curOff != bestOff:
				if curOff {
					pick = i
				}
			case counts[cur.NodeIP] != counts[best.NodeIP]:
				if counts[cur.NodeIP] > counts[best.NodeIP] {
					pick = i
				}
			case inst.ID > best.ID:
				pick = i
			}
		}
		gone := remaining[pick]
		counts[gone.NodeIP]--
		remaining = append(remaining[:pick], remaining[pick+1:]...)
		moves = append(moves, osi_types.GarageMove{OldID: gone.ID})
	}
	return moves
}

// SyncGarageServiceData sets the "garage" ServicesData entry's replica
// count to the number of instances, which is what `service list` and
// `service inspect` show for the family.
func SyncGarageServiceData(pd *osi_types.PlatformData) {
	idx, svc, err := FindServiceDataByName(pd, GarageServiceName)
	if err != nil {
		return
	}
	svc.Replicas = len(pd.PlatformInfo.GarageInstances)
	pd.PlatformInfo.ServicesData[idx] = *svc
}
