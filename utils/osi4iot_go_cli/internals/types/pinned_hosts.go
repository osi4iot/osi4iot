package types

// GPU nodes and the pinned services
//
// NATS (nats_N), Patroni (admin-id, metrics-id) and Garage (garage_N) are
// pinned to a node by label, with their data in a local volume there. A
// GPU node must not carry those labels: it is kept for pipelines (and the
// global services such as vector), and a pinned instance on it could
// never be moved off without moving its data.
//
// PinnedWorkers is the one place that decides which workers the pinned
// services may use, so the label assignment, the placement checks, the
// Garage host list and the node-removal plan all agree.

// PinnedWorkers returns the "Platform worker" nodes that may host the
// pinned services, in state-file order: the workers without a GPU. When
// every worker has a GPU (a platform with a single, GPU, worker) all of
// them are returned, since otherwise those services would have nowhere
// to run.
func PinnedWorkers(nodes []NodeData) []NodeData {
	var all, cpuOnly []NodeData
	for _, node := range nodes {
		if node.NodeRole != "Platform worker" {
			continue
		}
		all = append(all, node)
		if node.NodeGPU == "" {
			cpuOnly = append(cpuOnly, node)
		}
	}
	if len(cpuOnly) > 0 {
		return cpuOnly
	}
	return all
}

// PinnedWorkerIPs is PinnedWorkers as a set of addresses.
func PinnedWorkerIPs(nodes []NodeData) map[string]bool {
	ips := map[string]bool{}
	for _, node := range PinnedWorkers(nodes) {
		ips[node.NodeIP] = true
	}
	return ips
}

