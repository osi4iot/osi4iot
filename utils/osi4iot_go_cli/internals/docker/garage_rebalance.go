package docker

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// Changing the Garage cluster — moving an instance to another node,
// adding one, retiring one — always goes through the same steps, one
// change at a time:
//
//  1. Preconditions: the cluster is healthy and no earlier layout change
//     is still migrating data.
//  2. A new instance, if the step has one, is created on its node and
//     must be connected to the cluster before anything else happens.
//  3. ONE layout change: the new node gets its role and/or the old one
//     loses it. Garage then migrates in the background, writing to both
//     the old and the new set of nodes and reading from the old one
//     until the new one is in sync, so the platform keeps working.
//  4. Wait for the migration: no layout version left in "Draining", and
//     — when an instance is retired — its block resync queue empty,
//     several polls in a row (Garage itself warns that a version already
//     "Historical" may still have blocks in transit). Only the retiring
//     instance's queue: see waitGarageMigrated.
//  5. Only then is the old instance stopped and its volumes deleted.
//
// Never more than one change in flight: with a replication factor of 3
// that keeps at least two healthy copies of everything at every moment.
//
// The step in progress is recorded in the state file
// (GaragePendingMove) before anything irreversible, so an interrupted run
// — Ctrl-C, a lost SSH session — is resumed by the next one from where
// it stopped instead of starting a second change.

// garageCluster is what the steps need from the outside world, so they
// can be tested against a simulated Garage.
type garageCluster interface {
	// Admin runs a Garage admin API call (`garage json-api`) on a running
	// instance, other than avoidID, and returns the JSON answer.
	Admin(endpoint string, payload any, avoidID int) ([]byte, error)
	// Save writes the state file.
	Save() error
	// Relabel puts every node's garage_<ID> labels in line with the state.
	Relabel() error
	// CreateInstance creates the instance's secrets, volumes and service.
	// Idempotent.
	CreateInstance(inst pt.GarageInstance) error
	// RemoveInstance removes the instance's service and, once its
	// containers are gone, its volumes. Idempotent.
	RemoveInstance(inst pt.GarageInstance) error
	Sleep(d time.Duration)
	Logf(format string, args ...any)
}

const (
	garagePollInterval = 10 * time.Second
	// How long a freshly created instance may take to connect — image
	// pull on a new node included.
	garageInstanceUpTimeout = 10 * time.Minute
	// Consecutive "nothing left to move" polls before an old instance is
	// retired.
	garageQuietPolls = 3
)

// RebalanceGarage resumes an interrupted step, then moves instances until
// they are spread evenly over the nodes that may host them.
func RebalanceGarage(pd *pt.PlatformData, dc *pt.DockerClient, logger *log.Logger) error {
	return rebalanceGarage(pd, newRealGarageCluster(pd, dc, logger), utils.GarageHostIPs(pd.PlatformInfo))
}

// EvacuateGarageNode moves every instance off nodeIP, for a node that is
// about to leave the platform. The remaining instances end up spread
// evenly over the remaining hosts (the managers, if no worker remains).
func EvacuateGarageNode(pd *pt.PlatformData, dc *pt.DockerClient, nodeIP string, logger *log.Logger) error {
	return rebalanceGarage(pd, newRealGarageCluster(pd, dc, logger), garageHostsWithout(pd.PlatformInfo, nodeIP))
}

// ScaleGarage takes the cluster to target instances.
func ScaleGarage(pd *pt.PlatformData, dc *pt.DockerClient, target int, logger *log.Logger) error {
	return scaleGarage(pd, newRealGarageCluster(pd, dc, logger), utils.GarageHostIPs(pd.PlatformInfo), target)
}

// garageHostsWithout lists the hosts Garage may use once nodeIP is gone.
func garageHostsWithout(pi pt.PlatformInfo, nodeIP string) []string {
	rest := pi
	rest.NodesData = nil
	for _, n := range pi.NodesData {
		if n.NodeIP != nodeIP {
			rest.NodesData = append(rest.NodesData, n)
		}
	}
	return utils.GarageHostIPs(rest)
}

func rebalanceGarage(pd *pt.PlatformData, c garageCluster, hosts []string) error {
	if !utils.IsGarage(pd.PlatformInfo) || len(pd.PlatformInfo.GarageInstances) == 0 {
		return nil
	}
	if len(hosts) == 0 {
		return fmt.Errorf("no node left to run Garage on")
	}
	if err := resumeGarageStep(pd, c); err != nil {
		return err
	}
	did := 0
	for {
		moves := utils.PlanGarageRebalance(pd.PlatformInfo, hosts)
		if len(moves) == 0 {
			break
		}
		if did == 0 {
			c.Logf("Garage: %d instance(s) to move.", len(moves))
		}
		if err := runGarageStep(pd, c, moves[0]); err != nil {
			return err
		}
		did++
	}
	if did == 0 {
		c.Logf("Garage instances are evenly spread; nothing to move.")
	}
	return nil
}

func scaleGarage(pd *pt.PlatformData, c garageCluster, hosts []string, target int) error {
	if err := utils.CheckGarageScale(pd.PlatformInfo, hosts, target); err != nil {
		return err
	}
	if err := resumeGarageStep(pd, c); err != nil {
		return err
	}
	for {
		moves := utils.PlanGarageScale(pd.PlatformInfo, hosts, target)
		if len(moves) == 0 {
			break
		}
		if err := runGarageStep(pd, c, moves[0]); err != nil {
			return err
		}
	}
	// Normally already even; a scale is also a chance to fix a spread
	// left uneven by earlier changes.
	return rebalanceGarage(pd, c, hosts)
}

func resumeGarageStep(pd *pt.PlatformData, c garageCluster) error {
	pending := pd.PlatformInfo.GaragePendingMove
	if pending == nil {
		return nil
	}
	c.Logf("Garage: resuming an interrupted change (%s).", describeGarageStep(*pending))
	return runGarageStep(pd, c, *pending)
}

func describeGarageStep(m pt.GarageMove) string {
	switch {
	case m.OldID != 0 && m.ToIP != "":
		return fmt.Sprintf("move garage_%d to %s", m.OldID, m.ToIP)
	case m.ToIP != "":
		return fmt.Sprintf("add an instance on %s", m.ToIP)
	default:
		return fmt.Sprintf("retire garage_%d", m.OldID)
	}
}

// runGarageStep carries one change through to the end. Every stage
// checks what is already done, so it is also how an interrupted change
// is resumed.
func runGarageStep(pd *pt.PlatformData, c garageCluster, step pt.GarageMove) error {
	pi := &pd.PlatformInfo
	resuming := pi.GaragePendingMove != nil

	var old *pt.GarageInstance
	if step.OldID != 0 {
		if inst, ok := utils.GarageInstanceByID(*pi, step.OldID); ok {
			old = &inst
		}
	}
	if step.ToIP == "" && old == nil {
		// A retirement whose instance is already gone: finished.
		pi.GaragePendingMove = nil
		return c.Save()
	}

	c.Logf("Garage: %s.", describeGarageStep(step))

	// 1. Preconditions — only before starting. A resumed step is by
	// definition in the middle of a migration.
	if !resuming {
		if err := checkGarageReady(c); err != nil {
			return err
		}
	}

	// 2. The new instance.
	var newInst *pt.GarageInstance
	if step.ToIP != "" {
		if step.NewID == 0 {
			inst := utils.NewGarageInstance(pi, step.ToIP)
			step.NewID = inst.ID
		}
		pi.GaragePendingMove = &step
		// Saved before anything is created: the new identity must be on
		// disk before Swarm ever sees it.
		if err := c.Save(); err != nil {
			return err
		}
		inst, ok := utils.GarageInstanceByID(*pi, step.NewID)
		if !ok {
			return fmt.Errorf("garage_%d is recorded as being created but is not in the state file", step.NewID)
		}
		newInst = &inst
		if err := c.Relabel(); err != nil {
			return err
		}
		if err := c.CreateInstance(inst); err != nil {
			return err
		}
		if err := waitGarageNodeUp(c, inst); err != nil {
			return err
		}
	} else {
		pi.GaragePendingMove = &step
		if err := c.Save(); err != nil {
			return err
		}
	}

	// 3. The layout change.
	if err := applyGarageLayoutChange(pd, c, newInst, old); err != nil {
		return err
	}

	// 4. The migration.
	if err := waitGarageMigrated(c, old); err != nil {
		return err
	}

	// 5. Retire the old instance. Volumes go while its label is still on
	// its node — that is how the CLI finds them.
	if old != nil {
		if err := c.RemoveInstance(*old); err != nil {
			return err
		}
		utils.RemoveGarageInstance(pi, old.ID)
	}
	pi.GaragePendingMove = nil
	if err := c.Save(); err != nil {
		return err
	}
	if err := c.Relabel(); err != nil {
		return err
	}
	c.Logf("Garage: done (%s).", describeGarageStep(step))
	return nil
}

// ── Garage admin API answers (camelCase, as `garage json-api` prints) ──

type garageHealth struct {
	Status string `json:"status"`
}

type garageLayoutRole struct {
	ID string `json:"id"`
}

type garageLayout struct {
	Version           int64              `json:"version"`
	Roles             []garageLayoutRole `json:"roles"`
	StagedRoleChanges []json.RawMessage  `json:"stagedRoleChanges"`
}

type garageLayoutHistory struct {
	CurrentVersion int64 `json:"currentVersion"`
	Versions       []struct {
		Version int64  `json:"version"`
		Status  string `json:"status"`
	} `json:"versions"`
}

type garageClusterStatus struct {
	Nodes []struct {
		ID   string `json:"id"`
		IsUp bool   `json:"isUp"`
	} `json:"nodes"`
}

type garageNodeStatistics struct {
	Success map[string]struct {
		BlockManagerStats *struct {
			ResyncQueueLen uint64 `json:"resyncQueueLen"`
			ResyncErrors   uint64 `json:"resyncErrors"`
		} `json:"blockManagerStats"`
	} `json:"success"`
	Error map[string]string `json:"error"`
}

func adminJSON(c garageCluster, endpoint string, payload any, avoidID int, out any) error {
	raw, err := c.Admin(endpoint, payload, avoidID)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("unexpected answer to %s: %w", endpoint, err)
	}
	return nil
}

func layoutDraining(c garageCluster) (bool, error) {
	var history garageLayoutHistory
	if err := adminJSON(c, "GetClusterLayoutHistory", nil, 0, &history); err != nil {
		return false, err
	}
	for _, v := range history.Versions {
		if v.Status == "Draining" {
			return true, nil
		}
	}
	return false, nil
}

// checkGarageReady refuses to start a change on a cluster that is not
// healthy, or that is still migrating data from an earlier change.
func checkGarageReady(c garageCluster) error {
	var health garageHealth
	if err := adminJSON(c, "GetClusterHealth", nil, 0, &health); err != nil {
		return fmt.Errorf("cannot read Garage's health: %w", err)
	}
	if health.Status != "healthy" {
		return fmt.Errorf("Garage is %q, not healthy: no instance is moved, added or retired "+
			"until every instance is up (osi4iot service list)", health.Status)
	}
	draining, err := layoutDraining(c)
	if err != nil {
		return err
	}
	if draining {
		return fmt.Errorf("Garage is still migrating data from an earlier change; try again when it ends")
	}
	return nil
}

func waitGarageNodeUp(c garageCluster, inst pt.GarageInstance) error {
	nodeID := utils.GarageNodeID(inst)
	for waited := time.Duration(0); ; waited += garagePollInterval {
		var status garageClusterStatus
		if err := adminJSON(c, "GetClusterStatus", nil, inst.ID, &status); err == nil {
			for _, n := range status.Nodes {
				if n.ID == nodeID && n.IsUp {
					c.Logf("  garage_%d is up and connected.", inst.ID)
					return nil
				}
			}
		}
		if waited >= garageInstanceUpTimeout {
			return fmt.Errorf("garage_%d did not connect to the cluster within %s "+
				"(docker service ps %s); run the same command again to resume",
				inst.ID, garageInstanceUpTimeout, utils.GarageInstanceServiceName(inst.ID))
		}
		c.Sleep(garagePollInterval)
	}
}

// applyGarageLayoutChange gives newInst its role and takes old's away,
// in one layout version — or does nothing if that is already the layout.
func applyGarageLayoutChange(pd *pt.PlatformData, c garageCluster, newInst, old *pt.GarageInstance) error {
	var layout garageLayout
	if err := adminJSON(c, "GetClusterLayout", nil, 0, &layout); err != nil {
		return err
	}
	hasRole := map[string]bool{}
	for _, r := range layout.Roles {
		hasRole[r.ID] = true
	}

	var roles []map[string]any
	if newInst != nil && !hasRole[utils.GarageNodeID(*newInst)] {
		roles = append(roles, map[string]any{
			"id":       utils.GarageNodeID(*newInst),
			"zone":     utils.GarageZone(pd.PlatformInfo, newInst.NodeIP),
			"capacity": utils.GarageNodeCapacity,
			"tags":     []string{},
		})
	}
	if old != nil && hasRole[utils.GarageNodeID(*old)] {
		roles = append(roles, map[string]any{"id": utils.GarageNodeID(*old), "remove": true})
	}
	if len(roles) == 0 {
		return nil // already applied (a resumed step)
	}
	if len(layout.StagedRoleChanges) > 0 {
		return fmt.Errorf("Garage's layout has %d staged change(s) nobody applied; "+
			"review them (garage layout show, inside a garage container) before changing it",
			len(layout.StagedRoleChanges))
	}
	if _, err := c.Admin("UpdateClusterLayout", map[string]any{"roles": roles}, 0); err != nil {
		return fmt.Errorf("error staging the layout change: %w", err)
	}
	if _, err := c.Admin("ApplyClusterLayout", map[string]any{"version": layout.Version + 1}, 0); err != nil {
		return fmt.Errorf("error applying the layout change: %w", err)
	}
	c.Logf("  Layout v%d applied; Garage is migrating data.", layout.Version+1)

	// Make the new node claim every block it now holds right away. Left
	// alone, Garage queues them as it notices them; a full block repair
	// on the node puts each one in its resync queue with no delay.
	// Best effort: the migration completes either way, just later.
	if newInst != nil {
		if _, err := c.Admin("LaunchRepairOperation", map[string]any{
			"node": utils.GarageNodeID(*newInst),
			"body": map[string]any{"repairType": "blocks"},
		}, 0); err != nil {
			c.Logf("  (could not start a block repair on garage_%d to speed things up: %v)", newInst.ID, err)
		}
	}
	return nil
}

// waitGarageMigrated waits until no layout version is draining and, if
// an instance is being retired, its block resync queue has stayed empty
// with no errors for garageQuietPolls polls in a row. No time limit:
// copying a replica takes as long as the data is big, and the operator
// can interrupt and resume at any time.
//
// Only the retiring instance's queue counts. While a node leaves the
// layout, Garage goes over every block it holds and, for any block its
// new holders lack, sends it to them before calling it done: an empty
// queue there means everything it held is safely elsewhere — exactly
// what must be true before its volumes are deleted. The other nodes'
// queues never stay empty on a live platform (every block written or
// released passes through them), and nothing of theirs is about to be
// deleted.
func waitGarageMigrated(c garageCluster, old *pt.GarageInstance) error {
	var watch []pt.GarageInstance
	if old != nil {
		watch = append(watch, *old)
		c.Logf("  Waiting for garage_%d to hand over its blocks before it is removed.", old.ID)
		c.Logf("  Garage keeps a node's blocks for about 10 minutes after they move away " +
			"(a deliberate safety delay), so this takes at least that long whatever the size " +
			"of the data. The platform keeps working meanwhile, and interrupting (Ctrl-C) is " +
			"safe: 'osi4iot service rebalance garage' resumes it.")
	}
	quiet := 0
	for poll := 0; ; poll++ {
		draining, err := layoutDraining(c)
		if err != nil {
			return err
		}
		pending := uint64(0)
		var notes []string
		for _, inst := range watch {
			queue, errs, err := garageResyncQueue(c, inst)
			if err != nil {
				return err
			}
			pending += queue
			if errs > 0 {
				notes = append(notes, fmt.Sprintf("garage_%d: %d block(s) with resync errors", inst.ID, errs))
			}
			if queue > 0 {
				notes = append(notes, fmt.Sprintf("garage_%d: %d block(s) to resync", inst.ID, queue))
			}
		}
		done := !draining && pending == 0 && len(notes) == 0
		if done {
			quiet++
			if quiet >= garageQuietPolls {
				c.Logf("  Data migrated.")
				return nil
			}
		} else {
			quiet = 0
		}
		if poll%6 == 0 && !done {
			state := "metadata synced"
			if draining {
				state = "metadata syncing"
			}
			if len(notes) > 0 {
				state += "; " + strings.Join(notes, "; ")
			}
			elapsed := time.Duration(poll) * garagePollInterval
			c.Logf("  Migrating (%s): %s", elapsed.Round(time.Second), state)
		}
		c.Sleep(garagePollInterval)
	}
}

// garageResyncQueue reads one instance's block resync queue.
func garageResyncQueue(c garageCluster, inst pt.GarageInstance) (uint64, uint64, error) {
	nodeID := utils.GarageNodeID(inst)
	var stats garageNodeStatistics
	if err := adminJSON(c, "GetNodeStatistics", map[string]any{"node": nodeID, "body": nil}, 0, &stats); err != nil {
		return 0, 0, err
	}
	answer, ok := stats.Success[nodeID]
	if !ok {
		return 0, 0, fmt.Errorf("garage_%d did not answer for its statistics: %s — it must stay up "+
			"until its data has been migrated", inst.ID, stats.Error[nodeID])
	}
	if answer.BlockManagerStats == nil {
		return 0, 0, fmt.Errorf("garage_%d reports no block statistics (Garage older than v2?)", inst.ID)
	}
	return answer.BlockManagerStats.ResyncQueueLen, answer.BlockManagerStats.ResyncErrors, nil
}
