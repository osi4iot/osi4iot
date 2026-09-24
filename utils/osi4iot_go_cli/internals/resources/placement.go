package resources

import (
	"fmt"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// Where the replicated services are allowed to run.
//
// # The rule
//
// nats, patroni_admin and patroni_metrics are pinned one replica per
// "Platform worker": replica i goes to worker i, through the labels
// nats_i, admin-id=i and metrics-id=i. That is what keeps a replica on
// the same machine — and therefore on the same local volume — across
// deployments.
//
// Two cases fall outside it:
//
//   - No workers at all. A cluster of managers only is a legitimate
//     shape, and there the replicas run on the managers with no
//     placement labels involved. nats.go already does this; the Patroni
//     services have to agree.
//   - Fewer workers than replicas. This one has no sensible answer:
//     with three Patroni replicas and two workers, the third has no
//     node carrying admin-id=3 and its task waits forever, pending,
//     with nothing reporting it. Better to refuse before deploying.
//
// # Why it lives here
//
// The question is asked in three places — the form, when the answers
// are confirmed; init, before anything is created; and run, before a
// redeploy — and all three must answer it the same way. The resources
// package imports only types, so services, docker and cmd can all use
// it without a cycle.

// PlacementTarget is one of the services pinned per worker.
type PlacementTarget struct {
	// Service is the name an operator would recognise.
	Service string
	// Replicas is how many are configured.
	Replicas int
	// LabelPrefix is the label carrying the replica number.
	LabelPrefix string
}

// PlatformWorkerCount returns how many nodes have the "Platform worker"
// role.
func PlatformWorkerCount(pd *pt.PlatformData) int {
	return GetNodeRoleNumMap(pd)["Platform worker"]
}

// UsesPlacementLabels reports whether the replicated services should be
// pinned by label at all.
//
// False when there are no workers: then the services run on the
// managers without constraints, and writing nats_i or admin-id onto a
// manager would be labelling a node nothing will ever be scheduled to
// by those labels.
//
// Also false for a local deployment, which is a single node running
// everything.
func UsesPlacementLabels(pd *pt.PlatformData) bool {
	if pd.PlatformInfo.DeploymentLocation == "Local deployment" {
		return false
	}
	return PlatformWorkerCount(pd) > 0
}

// PlacementTargets lists the services pinned per worker, with the
// replica count each one is configured for.
func PlacementTargets(pd *pt.PlatformData) []PlacementTarget {
	pi := pd.PlatformInfo

	targets := []PlacementTarget{
		{Service: "nats", Replicas: natsReplicaCount(pd), LabelPrefix: "nats_"},
	}
	if pi.UsePatroniTool {
		targets = append(targets,
			PlacementTarget{
				Service:     "patroni_admin",
				Replicas:    maxInt(pi.NumPatroniAdminNodes, 1),
				LabelPrefix: "admin-id",
			},
			PlacementTarget{
				Service:     "patroni_metrics",
				Replicas:    maxInt(pi.NumPatroniMetricsNodes, 1),
				LabelPrefix: "metrics-id",
			},
		)
	}
	return targets
}

// ValidatePlacement refuses a configuration whose replicas cannot all
// be placed.
//
// Returns nil for a local deployment and for a managers-only cluster:
// neither pins anything, so there is nothing that can fail to fit.
func ValidatePlacement(pd *pt.PlatformData) error {
	if !UsesPlacementLabels(pd) {
		return nil
	}

	workers := PlatformWorkerCount(pd)

	var tooMany []string
	for _, target := range PlacementTargets(pd) {
		if target.Replicas > workers {
			tooMany = append(tooMany, fmt.Sprintf("%s wants %d replica(s)",
				target.Service, target.Replicas))
		}
	}
	if len(tooMany) == 0 {
		return nil
	}

	return fmt.Errorf("this platform has %d node(s) with the 'Platform worker' role, "+
		"and %s.\n"+
		"Each replica is pinned to its own worker, so the ones with no worker to go to "+
		"would sit unschedulable and nothing would report it.\n"+
		"Either add workers, or lower the replica counts",
		workers, strings.Join(tooMany, ", and "))
}

// natsReplicaCount reads how many NATS servers are configured.
func natsReplicaCount(pd *pt.PlatformData) int {
	if replicas := getServiceReplicasPtr(pd, "nats"); replicas != nil && *replicas > 0 {
		return int(*replicas)
	}
	return 1
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}