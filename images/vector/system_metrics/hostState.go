package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/client"
)

// NodeStateMetric maps 1-to-1 to the observability.host_node_state table.
// One row is emitted per cluster node per collection run. The Vector pipeline
// upserts these rows by node_id so the table always reflects the current
// state of the cluster without accumulating history.
type NodeStateMetric struct {
	NodeID       string            `json:"node_id"`
	NodeName     string            `json:"node_name"`
	Hostname     string            `json:"hostname"`
	SwarmRole    string            `json:"swarm_role"`   // manager | worker
	Availability string            `json:"availability"` // active | drain | pause
	State        string            `json:"state"`        // ready | down | disconnected
	Labels       map[string]string `json:"labels,omitempty"`
	LastSeen     time.Time         `json:"last_seen"`
}

// collectHostState queries the Swarm API for all cluster nodes and emits one
// NodeStateMetric JSON object per node to stdout.
//
// This collector must only run on manager nodes — workers cannot call NodeList.
// The Vector pipeline is responsible for routing this collector to managers only
// (via placement constraints on the vector_manager service).
//
// If the local daemon is not a Swarm manager, collectHostState logs a warning
// and exits cleanly so a misconfigured deployment does not crash the collector.
func collectHostState(pretty bool) error {
	cli, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return fmt.Errorf("could not connect to Docker daemon: %w", err)
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	info, err := cli.Info(ctx)
	if err != nil {
		return fmt.Errorf("error querying Docker info: %w", err)
	}

	// Guard: only managers can call NodeList.
	if info.Swarm.NodeID == "" || !info.Swarm.ControlAvailable {
		fmt.Fprintf(os.Stderr,
			"[host_state] skipping: node %s is not a Swarm manager\n", info.Name)
		return nil
	}

	// Guard: only the Raft leader emits metrics to avoid redundant upserts
	// from all 3 managers writing the same data every 30 seconds.
	node, _, err := cli.NodeInspectWithRaw(ctx, info.Swarm.NodeID)
	if err != nil {
		return fmt.Errorf("NodeInspect(%s): %w", info.Name, err)
	}
	if !node.ManagerStatus.Leader {
		fmt.Fprintf(os.Stderr,
			"[host_state] skipping: node %s is not the Swarm leader\n", info.Name)
		return nil
	}

	nodes, err := cli.NodeList(ctx, swarm.NodeListOptions{
		Filters: filters.NewArgs(),
	})
	if err != nil {
		return fmt.Errorf("NodeList: %w", err)
	}

	now := time.Now().UTC()
	enc := json.NewEncoder(os.Stdout)
	if pretty {
		enc.SetIndent("", "  ")
	}

	for _, node := range nodes {
		m := NodeStateMetric{
			NodeID:       node.ID,
			NodeName:     node.Description.Hostname,
			Hostname:     node.Description.Hostname,
			SwarmRole:    strings.ToLower(string(node.Spec.Role)),
			Availability: strings.ToLower(string(node.Spec.Availability)),
			State:        strings.ToLower(string(node.Status.State)),
			Labels:       node.Spec.Labels,
			LastSeen:     now,
		}
		if err := enc.Encode(m); err != nil {
			return fmt.Errorf("error writing node state metric for %s: %w", node.ID[:12], err)
		}
	}

	return nil
}