package pipelinesplacement

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"
)

const serviceName = "pipelines"

// Controller adjusts the placement of the pipelines service to the
// Pipelines workers that are up (see the package documentation).
type Controller struct {
	cli *client.Client
	// how long a Pipelines worker must be up before the replicas go back
	// to it: a machine that boots in fits and starts must not make them
	// come and go
	StableFor time.Duration
	// the check that catches what the events missed
	Interval time.Duration
	now      func() time.Time
	// since when each node (by id) has been ready and active
	upSince map[string]time.Time
}

func New(cli *client.Client, stableFor, interval time.Duration) *Controller {
	return &Controller{cli: cli, StableFor: stableFor, Interval: interval, now: time.Now, upSince: map[string]time.Time{}}
}

// Run watches the node events and checks every Interval until ctx ends.
func (c *Controller) Run(ctx context.Context) {
	log.Printf("[pipelines placement] watching the Pipelines workers (stable after %s)", c.StableFor)
	ticker := time.NewTicker(c.Interval)
	defer ticker.Stop()
	events := c.watch(ctx)
	c.check(ctx)
	for {
		// a node that has just come up is stable StableFor later: check then
		var stable <-chan time.Time
		if wait := c.nextStable(); wait > 0 {
			stable = time.After(wait)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-events:
		case <-stable:
		}
		c.check(ctx)
	}
}

// watch turns the node events into a signal, reopening the stream when it
// ends (the daemon restarted, say)
func (c *Controller) watch(ctx context.Context) <-chan struct{} {
	out := make(chan struct{}, 1)
	go func() {
		for ctx.Err() == nil {
			res := c.cli.Events(ctx, client.EventsListOptions{Filters: make(client.Filters).Add("type", "node")})
		stream:
			for {
				select {
				case <-ctx.Done():
					return
				case _, ok := <-res.Messages:
					if !ok {
						break stream
					}
					select {
					case out <- struct{}{}:
					default:
					}
				case err := <-res.Err:
					if err != nil && ctx.Err() == nil {
						log.Printf("[pipelines placement] node events: %v (watching again)", err)
					}
					break stream
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
		}
	}()
	return out
}

func (c *Controller) nextStable() time.Duration {
	var next time.Duration
	now := c.now()
	for _, since := range c.upSince {
		left := since.Add(c.StableFor).Sub(now)
		if left > 0 && (next == 0 || left < next) {
			next = left + time.Second
		}
	}
	return next
}

func (c *Controller) check(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if msg, err := c.Reconcile(ctx); err != nil {
		log.Printf("[pipelines placement] %v", err)
	} else if msg != "" {
		log.Printf("[pipelines placement] %s", msg)
	}
}

// Reconcile updates the placement of pipelines when it is not the one
// the Pipelines workers that are up call for. The message says what it
// did ("" nothing).
func (c *Controller) Reconcile(ctx context.Context) (string, error) {
	nodes, err := c.cli.NodeList(ctx, client.NodeListOptions{})
	if err != nil {
		return "", fmt.Errorf("listing the nodes: %w", err)
	}
	up, stable := c.workers(nodes.Items)

	inspected, err := c.cli.ServiceInspect(ctx, serviceName, client.ServiceInspectOptions{})
	if err != nil {
		return "", nil // not deployed (the platform is stopped)
	}
	svc := inspected.Service
	if svc.Spec.Annotations.Labels[ManagedLabel] != ManagedValue {
		return "", nil // a platform without Pipelines workers
	}
	current := swarm.Placement{}
	if svc.Spec.TaskTemplate.Placement != nil {
		current = *svc.Spec.TaskTemplate.Placement
	}
	// on the Pipelines workers, the replicas stay while those up hold
	// them; back to them only once they have been up for StableFor
	workers := stable
	if isDedicated(current.Constraints) {
		workers = up
	}
	in := inputOf(svc.Spec, workers)
	want := DecidePlacement(in)
	var spread []string
	for _, p := range current.Preferences {
		if p.Spread != nil {
			spread = append(spread, p.Spread.SpreadDescriptor)
		}
	}
	if SamePlacement(current.Constraints, spread, want) {
		return "", nil
	}

	spec := svc.Spec
	placement := current
	placement.Constraints = want.Constraints
	placement.Preferences = nil
	for _, d := range want.Spread {
		placement.Preferences = append(placement.Preferences, swarm.PlacementPreference{Spread: &swarm.SpreadOver{SpreadDescriptor: d}})
	}
	spec.TaskTemplate.Placement = &placement
	if _, err := c.cli.ServiceUpdate(ctx, svc.ID, client.ServiceUpdateOptions{Version: svc.Version, Spec: spec}); err != nil {
		return "", fmt.Errorf("updating the placement of pipelines: %w", err)
	}
	if want.Dedicated {
		return fmt.Sprintf("pipelines back on the Pipelines workers (%d up, %d replicas): %s",
			len(in.Workers), in.Replicas, strings.Join(want.Constraints, ", ")), nil
	}
	return fmt.Sprintf("pipelines opened to the Platform workers (%d Pipelines workers up for %d replicas): %s",
		len(in.Workers), in.Replicas, strings.Join(want.Constraints, ", ")), nil
}

func isDedicated(constraints []string) bool {
	for _, c := range constraints {
		if strings.ReplaceAll(c, " ", "") == "node.labels.pipelines_worker==true" {
			return true
		}
	}
	return false
}

// workers are the Pipelines workers ready and active (up), and those of
// them up for StableFor (stable); it also keeps upSince
func (c *Controller) workers(nodes []swarm.Node) (up, stable []Worker) {
	now := c.now()
	seen := map[string]bool{}
	for _, n := range nodes {
		if n.Spec.Role != swarm.NodeRoleWorker || n.Spec.Labels[WorkerLabel] != "true" {
			continue
		}
		ready := n.Status.State == swarm.NodeStateReady && n.Spec.Availability == swarm.NodeAvailabilityActive
		if !ready {
			delete(c.upSince, n.ID)
			continue
		}
		seen[n.ID] = true
		since, ok := c.upSince[n.ID]
		if !ok {
			since = now
			c.upSince[n.ID] = since
		}
		w := Worker{
			GPU:         n.Spec.Labels[GPULabel] == "nvidia",
			NanoCPUs:    n.Description.Resources.NanoCPUs,
			MemoryBytes: n.Description.Resources.MemoryBytes,
		}
		up = append(up, w)
		if now.Sub(since) >= c.StableFor {
			stable = append(stable, w)
		}
	}
	for id := range c.upSince {
		if !seen[id] {
			delete(c.upSince, id)
		}
	}
	return up, stable
}

// inputOf reads replicas, reservations and GPU use from the service
func inputOf(spec swarm.ServiceSpec, workers []Worker) Input {
	in := Input{GPUMode: spec.Annotations.Labels[GPUModeLabel], Workers: workers, Replicas: 1}
	if spec.Mode.Replicated != nil && spec.Mode.Replicated.Replicas != nil {
		in.Replicas = int(*spec.Mode.Replicated.Replicas)
	}
	if r := spec.TaskTemplate.Resources; r != nil && r.Reservations != nil {
		in.ReservedNanoCPUs = r.Reservations.NanoCPUs
		in.ReservedMemoryBytes = r.Reservations.MemoryBytes
	}
	if cs := spec.TaskTemplate.ContainerSpec; cs != nil {
		for _, kv := range cs.Env {
			if strings.HasPrefix(kv, "NVIDIA_VISIBLE_DEVICES=") {
				in.UsesGPU = true
			}
		}
	}
	return in
}
