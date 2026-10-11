// Package prune runs `docker system prune` across every node in the
// swarm, using Docker Swarm's global-job service mode: a single service
// is scheduled once per matching node (see swarm.GlobalJob), each task
// runs to completion, and the service is torn down again once every
// node is done. This is the SDK equivalent of:
//
//	docker service create \
//	    --name system_prune \
//	    --mode global-job \
//	    --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
//	    docker:cli \
//	    system prune -a -f --volumes
//
// run programmatically and torn down again instead of left behind.
//
// This needs the same thing certrenewer needs — a working Docker client
// and node.role==manager placement, since ServiceCreate/TaskList/
// ServiceRemove are manager-only Swarm API calls a worker node's local
// socket can't serve — see internal/dockersvc and cmd/system_manager's
// deploy-side placement constraint.
package prune

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"

	"system_manager/internal/config"
	"system_manager/internal/dockersvc"
	"system_manager/internal/schedule"
	"system_manager/internal/task"
)

// serviceName is fixed and reused for every run. Run removes the
// service again once the job converges (or fails/times out), so at most
// one system_prune service should ever exist at a time — see the
// pre-flight check in Run, which refuses to start a second one instead
// of silently colliding with a leftover from a previous run that didn't
// clean up.
const serviceName = "system_prune"

// jobTimeout bounds how long Run waits for every node to finish pruning
// before giving up. Generous — "-a" reclaims every image not backing a
// running task, which on a node with a large local image cache can mean
// a lot of disk I/O, not just network time.
const jobTimeout = 30 * time.Minute

// pollInterval is how often Run checks on the job's progress.
const pollInterval = 3 * time.Second

// Config holds the schedule for the periodic cluster-wide prune.
type Config struct {
	weekday time.Weekday
	hour    int // UTC
}

// LoadConfig reads the prune schedule from the environment. Defaults to
// Sunday 02:00 UTC — infrequent and off-peak. "-a" reclaims every image
// not backing a currently-running task, not just dangling layers, so
// running this often works against the layer cache services rely on
// when scaling up or redeploying; a weekly default trades a bit of
// reclaimed disk for not fighting that cache constantly.
func LoadConfig() Config {
	return Config{
		weekday: time.Weekday(config.EnvIntDefault("SYSTEM_MANAGER_PRUNE_WEEKDAY", int(time.Sunday))),
		hour:    config.EnvIntDefault("SYSTEM_MANAGER_PRUNE_HOUR", 2),
	}
}

// Pruner runs a cluster-wide `docker system prune` on demand (Run) and
// once a week on its own schedule (NextRun) — it implements
// task.Scheduled the same way backup.Target and certrenewer.Renewer do.
type Pruner struct {
	cfg Config
}

var _ task.Scheduled = (*Pruner)(nil)

// New returns a Pruner configured from cfg.
func New(cfg Config) *Pruner {
	return &Pruner{cfg: cfg}
}

// Subject identifies this task for NATS routing and logging as
// "system_prune", which natssvc turns into the subject
// "system_manager.system_prune". See auth_callout's infra.go for the
// permissions granted to system_manager's NKey on this subject.
func (p *Pruner) Subject() string { return "system_prune" }

// NextRun returns the next UTC occurrence of p's configured weekday and
// hour, satisfying task.Scheduled.
func (p *Pruner) NextRun(now time.Time) time.Time {
	return schedule.WeeklyAt(now, p.cfg.weekday, p.cfg.hour)
}

// Run creates the global-job service, waits for every node's task to
// reach a terminal state (or for jobTimeout to elapse), and always tears
// the service back down — even on failure or timeout — so a stuck node
// doesn't leave system_prune permanently occupying that name. The
// returned string is a one-line-per-node summary of how each node's
// prune went; a non-nil error means at least one node failed. params is
// unused — a cluster-wide prune has nothing per-request to configure.
func (p *Pruner) Run(ctx context.Context, params map[string]any) (string, error) {
	cli, err := dockersvc.NewClient()
	if err != nil {
		return "", fmt.Errorf("connecting to Docker: %w", err)
	}
	defer cli.Close()

	runCtx, cancel := context.WithTimeout(ctx, jobTimeout)
	defer cancel()

	if _, err := cli.ServiceInspect(runCtx, serviceName, client.ServiceInspectOptions{}); err == nil {
		return "", fmt.Errorf("service %q already exists — a previous run may not have cleaned up; remove it manually before retrying", serviceName)
	}

	result, err := cli.ServiceCreate(runCtx, client.ServiceCreateOptions{Spec: jobSpec()})
	if err != nil {
		return "", fmt.Errorf("creating global-job service: %w", err)
	}
	serviceID := result.ID
	defer removeService(cli, serviceID)

	log.Printf("[prune] %q created, waiting for every node to finish", serviceName)
	results, err := waitForCompletion(runCtx, cli, serviceID)
	if err != nil {
		return "", err
	}

	output, failed := formatResults(results)
	if failed > 0 {
		return output, fmt.Errorf("prune failed on %d/%d node(s)", failed, len(results))
	}
	return output, nil
}

// jobSpec builds the ServiceSpec for the global-job prune service — the
// SDK equivalent of the `docker service create --mode global-job ...`
// command in the package doc comment. Leaving ContainerSpec.Command
// unset keeps the docker:cli image's own ENTRYPOINT ("docker"); Args
// becomes the CMD appended after it, so the task runs exactly
// `docker system prune -a -f`.
//
// Deliberately WITHOUT --volumes. In Swarm, "volume not referenced by
// any container" is not "volume nobody wants" — it is "volume whose
// task container does not exist at this instant", which includes any
// service mid-rolling-update, mid-restart, or scaled to zero, and every
// volume belonging to a service not scheduled on this node. No volume
// in this platform is disposable, so there is nothing for --volumes to
// legitimately reclaim and a great deal for it to destroy.
func jobSpec() swarm.ServiceSpec {
	return swarm.ServiceSpec{
		Annotations: swarm.Annotations{
			Name:   serviceName,
			Labels: map[string]string{"app": "osi4iot"},
		},
		TaskTemplate: swarm.TaskSpec{
			ContainerSpec: &swarm.ContainerSpec{
				Image: "ghcr.io/osi4iot/system_prune:latest",
				Args:  []string{"system", "prune", "-a", "-f"},
				Mounts: []mount.Mount{
					{
						Type:   mount.TypeBind,
						Source: "/var/run/docker.sock",
						Target: "/var/run/docker.sock",
					},
				},
			},
			// Job semantics: run once per node, don't retry — a node
			// whose docker.sock is unreachable won't be fixed by
			// retrying without backoff, and we want a clear per-node
			// failure in the summary rather than the task looping.
			RestartPolicy: &swarm.RestartPolicy{
				Condition: swarm.RestartPolicyConditionNone,
			},
		},
		Mode: swarm.ServiceMode{
			GlobalJob: &swarm.GlobalJob{},
		},
	}
}

// removeService tears down the job service. It's always called via
// defer in Run, with its own short-lived context so a caller whose ctx
// is already past jobTimeout (or cancelled) doesn't prevent cleanup.
func removeService(cli *client.Client, serviceID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := cli.ServiceRemove(ctx, serviceID, client.ServiceRemoveOptions{}); err != nil {
		log.Printf("[prune] WARNING: could not remove service %q: %v", serviceName, err)
	}
}

// nodeResult is one node's outcome, extracted from its swarm.Task.
type nodeResult struct {
	nodeID   string
	state    swarm.TaskState
	exitCode int
	message  string
}

// waitForCompletion polls the job's tasks until every one of them has
// reached a terminal state and the task count has been stable across two
// consecutive polls (global-job tasks are all created up front against
// the node list at service-creation time, so in practice the count
// never actually grows — this is just a safety margin against reading
// a partially-scheduled job), or ctx is done.
func waitForCompletion(ctx context.Context, cli *client.Client, serviceID string) ([]nodeResult, error) {
	f := make(client.Filters).Add("service", serviceID)

	prevCount := -1
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("timed out waiting for prune tasks to finish: %w", ctx.Err())
		case <-time.After(pollInterval):
		}

		result, err := cli.TaskList(ctx, client.TaskListOptions{Filters: f})
		if err != nil {
			return nil, fmt.Errorf("listing prune tasks: %w", err)
		}
		tasks := result.Items
		if len(tasks) == 0 {
			continue // service just created, tasks not scheduled yet
		}

		allTerminal := len(tasks) == prevCount
		for _, t := range tasks {
			if !isTerminal(t.Status.State) {
				allTerminal = false
			}
		}
		prevCount = len(tasks)
		if allTerminal {
			return collectResults(tasks), nil
		}
	}
}

func isTerminal(s swarm.TaskState) bool {
	switch s {
	case swarm.TaskStateComplete, swarm.TaskStateFailed, swarm.TaskStateRejected, swarm.TaskStateShutdown:
		return true
	default:
		return false
	}
}

func collectResults(tasks []swarm.Task) []nodeResult {
	out := make([]nodeResult, 0, len(tasks))
	for _, t := range tasks {
		r := nodeResult{nodeID: t.NodeID, state: t.Status.State, message: t.Status.Err}
		if t.Status.ContainerStatus != nil {
			r.exitCode = t.Status.ContainerStatus.ExitCode
		}
		out = append(out, r)
	}
	return out
}

// formatResults renders one line per node plus a final tally, and
// returns how many nodes did not complete successfully.
func formatResults(results []nodeResult) (string, int) {
	var b strings.Builder
	failed := 0
	for _, r := range results {
		if r.state == swarm.TaskStateComplete {
			fmt.Fprintf(&b, "node %s: ok\n", shortID(r.nodeID))
			continue
		}
		failed++
		fmt.Fprintf(&b, "node %s: %s (exit %d)", shortID(r.nodeID), r.state, r.exitCode)
		if r.message != "" {
			fmt.Fprintf(&b, " — %s", r.message)
		}
		b.WriteByte('\n')
	}
	fmt.Fprintf(&b, "%d/%d node(s) completed successfully", len(results)-failed, len(results))
	return b.String(), failed
}

func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}
