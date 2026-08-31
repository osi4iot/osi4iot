package docker

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/nats-io/nats.go"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/configs"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/networks"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/secrets"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/services"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/volumes"
)

// ── Why this looks different from nats_replicas.go ───────────────────────
//
// NATS JetStream shards each stream's data across specific replica peers,
// so scaling it safely requires the whole leader-stepdown / backup-restore
// dance in nats_replicas.go.
//
// Patroni/PostgreSQL streaming replication doesn't have that problem: every
// node (patroni_adminN / patroni_metricsN) already holds a full physical
// copy of the data. Growing the cluster just means creating a new node and
// letting Patroni's standard base-backup bootstrap bring it up to date;
// shrinking it just means removing follower nodes — no data is uniquely
// held by any one of them.
//
// What *does* need explicit handling is the embedded-Raft DCS (see
// patroni.yml / entrypoint.sh): every node computes its Raft peer list
// (PATRONI_PARTNER_ADDRS) from the PATRONI_NUM_NODES env var at container
// start. That means every surviving node must be restarted with the new
// PATRONI_NUM_NODES whenever the cluster size changes — not just when
// crossing the standalone/cluster boundary like NATS's dependent-service
// secrets — which is what refreshPatroniNodesEnv below is for.

// patroniFamily describes everything that differs between the
// patroni_admin and patroni_metrics families, so the scaling logic itself
// (ScalePatroniFamily) is written once and shared between them.
type patroniFamily struct {
	// ServiceKey is used for resources.GetMemoryBytes/GetNanoCPU and for
	// waitUntilAllContainersAreHealthy's serviceType argument.
	ServiceKey string
	// NamePrefix is the swarm service name prefix: "patroni_admin" ->
	// patroni_admin1, patroni_admin2, ...
	NamePrefix string
	// SecretKey is the sd.Secrets key the node builder expects — the same
	// secret (passwords, not per-node config) is reused by every node.
	SecretKey string

	// SystemManagerName matches the "Name" system_manager's LeaderQuery
	// and SwitchoverToNode1 use ("admin"/"metrics") — see
	// system_manager/internal/patroni/patroni.go. Deliberately not the
	// same string as ServiceKey/NamePrefix: those are this platform's
	// Swarm-facing names (patroni_admin, patroni_admin1, ...), while
	// system_manager's family naming is its own, older convention.
	SystemManagerName string

	BuildNode func(replica int, pd *pt.PlatformData, sd pt.SwarmData, svcResources resources.SvcResources) pt.Service

	// CreateVolumes provisions the volume(s) for one new node, keyed
	// exactly as BuildNode's ServiceBuilder expects them in sd.Volumes.
	CreateVolumes func(pi pt.PlatformInfo, dc *pt.DockerClient, replica int) (map[string]pt.Volume, error)
	RemoveVolumes func(dc *pt.DockerClient, replica int) error

	// SetNumNodes persists the target node count on the PlatformInfo field
	// used at full-redeploy time (NumPatroniAdminNodes / NumPatroniMetricsNodes).
	SetNumNodes func(pi *pt.PlatformInfo, n int)
}

var patroniAdminFamily = patroniFamily{
	ServiceKey:        "patroni_admin",
	NamePrefix:        "patroni_admin",
	SecretKey:         "patroni_admin",
	SystemManagerName: "admin",
	BuildNode:         services.PatroniAdminNodeService,
	CreateVolumes: func(pi pt.PlatformInfo, dc *pt.DockerClient, replica int) (map[string]pt.Volume, error) {
		vol, err := volumes.CreatePatroniAdminVolume(pi, dc, replica)
		if err != nil {
			return nil, err
		}
		return map[string]pt.Volume{
			fmt.Sprintf("patroni_admin%d-data", replica): *vol,
		}, nil
	},
	RemoveVolumes: func(dc *pt.DockerClient, replica int) error {
		return volumes.RemovePatroniAdminVolume(dc, replica)
	},
	SetNumNodes: func(pi *pt.PlatformInfo, n int) { pi.NumPatroniAdminNodes = n },
}

var patroniMetricsFamily = patroniFamily{
	ServiceKey:        "patroni_metrics",
	NamePrefix:        "patroni_metrics",
	SecretKey:         "patroni_metrics",
	SystemManagerName: "metrics",
	BuildNode:         services.PatroniMetricsNodeService,
	CreateVolumes: func(pi pt.PlatformInfo, dc *pt.DockerClient, replica int) (map[string]pt.Volume, error) {
		dataVol, walVol, err := volumes.CreatePatroniMetricsVolumes(pi, dc, replica)
		if err != nil {
			return nil, err
		}
		return map[string]pt.Volume{
			fmt.Sprintf("patroni_metrics%d-data", replica): *dataVol,
			fmt.Sprintf("patroni_metrics%d-wal", replica):  *walVol,
		}, nil
	},
	RemoveVolumes: func(dc *pt.DockerClient, replica int) error {
		return volumes.RemovePatroniMetricsVolumes(dc, replica)
	},
	SetNumNodes: func(pi *pt.PlatformInfo, n int) { pi.NumPatroniMetricsNodes = n },
}

// GetPatroniFamilyReplicas counts how many nodes of the given family
// currently exist in the swarm — the same technique GetNatsReplicas uses
// for nats1..N: count services whose service_type label contains the
// family's name prefix.
// haproxyPatroniConfigFile is the container path HaproxyPatroniService
// mounts the haproxy.cfg Swarm Config at — must match
// haproxy_patroni.go's own ConfigReferenceFileTarget.Name.
const haproxyPatroniConfigFile = "/usr/local/etc/haproxy/haproxy.cfg"

// haproxyPatroniSettleDelay is how long refreshHaproxyPatroniConfig
// waits after its own rolling update reports complete, before
// returning control to its caller. See the call site inside that
// function for why this exists.
//
// A variable, not a constant, purely so tests can shorten it — every
// real caller uses the value set here.
var haproxyPatroniSettleDelay = 5 * time.Second

// refreshHaproxyPatroniConfig regenerates haproxy_patroni's haproxy.cfg
// from pd's CURRENT NumPatroniAdminNodes/NumPatroniMetricsNodes, and
// updates the running haproxy_patroni service (both of its 2 replicas)
// to reference it, replacing whatever config it referenced before.
//
// This has to run as part of every Patroni scale operation — up or
// down — because configs.CreateHaproxyPatroniConfig bakes the node
// count into a STATIC list of "server patroni_adminN ..." lines at
// config-generation time; nothing else keeps a previously-created
// config in sync as nodes are later added or removed. Without this,
// haproxy_patroni keeps health-checking (via resolvers docker_dns)
// hosts that either don't exist yet (scale up — harmless, they just
// start out DOWN until DNS resolves them once they actually come up)
// or, worse, no longer exist (scale down) — and DNS de-registration in
// this environment has the same real, variable latency as
// registration. Confirmed against real haproxy_patroni logs during a
// 5-to-1 scale-down: the four removed nodes' entries went DOWN with
// "Encountered error while resolving DNS", and because that coincided
// with the one surviving node also failing its own health check
// briefly (a separate, already-known effect of a large Patroni
// membership change), every listener was left with zero healthy
// servers ("has no server available!") for a moment — and a caller
// going through it at that exact moment (in that case,
// resetNode1Raft) got a bare connection EOF instead of a proper HTTP
// error or a clean success.
//
// A no-op if the newly-generated config's content — and therefore its
// content-derived name — is identical to what's already referenced;
// can happen if this is retried after a partial failure elsewhere in
// the same scale operation.
func refreshHaproxyPatroniConfig(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, replicas uint64) error {
	svc, err := utils.GetSwarmServiceByName(dc, "haproxy_patroni")
	if err != nil {
		return fmt.Errorf("error inspecting haproxy_patroni service: %v", err)
	}

	oldConfigName := ""
	for _, ref := range svc.Spec.TaskTemplate.ContainerSpec.Configs {
		if ref.File != nil && ref.File.Name == haproxyPatroniConfigFile {
			oldConfigName = ref.ConfigName
			break
		}
	}
	if oldConfigName == "" {
		return fmt.Errorf("haproxy_patroni service has no config mounted at %s", haproxyPatroniConfigFile)
	}

	newConfig := configs.CreateHaproxyPatroniConfig(pd)
	if newConfig.Name == oldConfigName {
		return nil
	}

	fmt.Printf("Reconfiguring haproxy_patroni for %s (%d node(s)):", family.ServiceKey, replicas)

	_, err = ServiceUpdate(pd, dc, svc, "haproxy_patroni", ServiceUpdateOptions{
		ConfigsUpdate: []ConfigUpdateConfig{
			{
				ConfigKey:     "haproxy_patroni",
				NewConfigName: newConfig.Name,
				OldConfigName: oldConfigName,
				NewConfigData: newConfig.Data,
				TargetFile:    haproxyPatroniConfigFile,
			},
		},
	})
	if err != nil {
		return fmt.Errorf("error updating haproxy_patroni config: %v", err)
	}

	// ServiceUpdate already waits for the rolling update itself to
	// report complete (both replicas Running/healthy again — see
	// utils.MonitorServiceRollingUpdate), but a config-mounted service
	// update recreates the container, and this environment's overlay
	// network needs a real, variable amount of time after a container
	// is (re)created before its new IP is reliably reachable from
	// other services — the same DNS/network convergence latency this
	// codebase has already had to account for elsewhere (see
	// entrypoint.sh's DNS-wait loop). Without a pause here, the very
	// next call through haproxy_patroni (queryPatroniLeader, right
	// after this returns) can land in that window and get a bare
	// connection EOF — confirmed happening in testing, immediately
	// after this function's own rolling update reported 100% complete.
	time.Sleep(haproxyPatroniSettleDelay)

	return nil
}

func GetPatroniFamilyReplicas(dc *pt.DockerClient, family patroniFamily) (uint64, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	svcs, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{Filters: filterArgs})
	if err != nil {
		return 0, fmt.Errorf("error listing services: %v", err)
	}

	count := 0
	for _, svc := range svcs {
		if val, ok := svc.Spec.Labels["service_type"]; ok && strings.Contains(val, family.NamePrefix) {
			count++
		}
	}
	return uint64(count), nil
}

func GetPatroniAdminReplicas(dc *pt.DockerClient) (uint64, error) {
	return GetPatroniFamilyReplicas(dc, patroniAdminFamily)
}

func GetPatroniMetricsReplicas(dc *pt.DockerClient) (uint64, error) {
	return GetPatroniFamilyReplicas(dc, patroniMetricsFamily)
}

// createPatroniNode provisions the volume(s) and swarm service for a
// single new node of the given family, mirroring CreateNatsService.
//
// pd must already have family.SetNumNodes(target) applied before calling
// this — the new node's PATRONI_NUM_NODES env (baked in by BuildNode) has
// to reflect the cluster's TARGET size from its very first boot, or it
// computes the wrong Raft partner_addrs immediately.
func createPatroniNode(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, replica int) error {
	pi := pd.PlatformInfo

	newVolumes, err := family.CreateVolumes(pi, dc, replica)
	if err != nil {
		return fmt.Errorf("error creating %s volume(s) for replica %d: %v", family.ServiceKey, replica, err)
	}

	var sd pt.SwarmData
	sd.Networks = make(map[string]pt.Network)
	patroniNetwork, err := networks.GetNetworkByName(dc, "patroni_net")
	if err != nil {
		return fmt.Errorf("error getting patroni network: %v", err)
	}
	sd.Networks["patroni_net"] = *patroniNetwork

	internalNetwork, err := networks.GetNetworkByName(dc, "internal_net")
	if err != nil {
		return fmt.Errorf("error getting internal network: %v", err)
	}
	sd.Networks["internal_net"] = *internalNetwork

	// Reuse the existing secret (superuser/admin/replicator/rewind
	// passwords + WAL-G key) — unlike nats_config, this doesn't depend on
	// node count, so there's nothing new to create here.
	sd.Secrets = make(map[string]pt.Secret)
	familySecret, err := secrets.GetSecretByKey(dc, family.SecretKey)
	if err != nil {
		return fmt.Errorf("error getting %s secret: %v", family.SecretKey, err)
	}
	sd.Secrets[family.SecretKey] = *familySecret

	sd.Volumes = newVolumes

	replicasValue := uint64(1)
	svcResources := resources.SvcResources{
		MemoryBytes: resources.GetMemoryBytes(pd, family.ServiceKey),
		NanoCPUs:    resources.GetNanoCPU(pd, family.ServiceKey),
		ReplicasPtr: &replicasValue,
	}

	svc := family.BuildNode(replica, pd, sd, svcResources)

	if err := CreateSwarmService(dc, svc); err != nil {
		return fmt.Errorf("error creating %s service for new replica %d: %v", family.ServiceKey, replica, err)
	}

	if err := addPatroniNodeServiceData(pd, family, replica); err != nil {
		return err
	}

	fmt.Printf("Service %s has been created successfully\n", svc.Name)
	return nil
}

// addPatroniNodeServiceData appends a ServicesData entry for a newly
// created node.
//
// Unlike "nats" — which has a single virtual ServicesData entry
// representing the whole family (see utils.GetDefaultServicesDataMap) —
// patroni_admin/patroni_metrics get ONE ServicesData entry PER NODE
// ("patroni_admin1", "patroni_admin2", ...), each independently editable
// via `service resources` / `service image`. So growing the cluster means
// adding a new per-node entry here, not bumping a shared Replicas field.
//
// The new entry copies Image/Cpu/Memory from node 1 so a prior resource
// or image override on the cluster carries over to the new node instead
// of silently resetting to the packaged default.
func addPatroniNodeServiceData(pd *pt.PlatformData, family patroniFamily, replica int) error {
	name := fmt.Sprintf("%s%d", family.NamePrefix, replica)

	if _, _, err := utils.FindServiceDataByName(pd, name); err == nil {
		return nil // already present — re-run after a partial failure
	}

	siblingName := fmt.Sprintf("%s1", family.NamePrefix)
	_, sibling, err := utils.FindServiceDataByName(pd, siblingName)
	if err != nil {
		return fmt.Errorf("error finding %s service data to use as template for %s: %v", siblingName, name, err)
	}

	pd.PlatformInfo.ServicesData = append(pd.PlatformInfo.ServicesData, pt.ServiceData{
		ServiceName: name,
		Image:       sibling.Image,
		Replicas:    1,
		Cpu:         sibling.Cpu,
		Memory:      sibling.Memory,
	})
	return nil
}

// removePatroniNodeServiceData drops the ServicesData entry of a removed
// node. A no-op (not an error) if it's already gone, so this is safe to
// call again after a partial failure.
func removePatroniNodeServiceData(pd *pt.PlatformData, family patroniFamily, replica int) {
	name := fmt.Sprintf("%s%d", family.NamePrefix, replica)
	idx, _, err := utils.FindServiceDataByName(pd, name)
	if err != nil {
		return
	}
	pd.PlatformInfo.ServicesData = append(
		pd.PlatformInfo.ServicesData[:idx],
		pd.PlatformInfo.ServicesData[idx+1:]...,
	)
}

// removePatroniNode removes a single node's service, volume(s), and
// ServicesData entry, mirroring RemoveNatsService.
//
// Safe to call on any node here, INCLUDING the current leader: the
// caller (ScalePatroniFamily's scale-down branch) is responsible for
// checking, once, before removing anything, whether the leader is
// among the whole set of nodes about to be removed, and moving it to
// node 1 first if so — see the comment there for why that has to
// happen once up front rather than per node inside this function.
func removePatroniNode(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, replica int) error {
	serviceName := fmt.Sprintf("%s%d", family.NamePrefix, replica)

	svc, err := utils.GetSwarmServiceByName(dc, serviceName)
	if err != nil {
		return fmt.Errorf("error inspecting %s service: %v", serviceName, err)
	}

	if err := dc.Cli.ServiceRemove(dc.Ctx, svc.ID); err != nil {
		return fmt.Errorf("error removing %s service: %v", serviceName, err)
	}

	if err := waitUntilServiceContainersAreGone(dc, serviceName); err != nil {
		return err
	}

	if err := family.RemoveVolumes(dc, replica); err != nil {
		return fmt.Errorf("error removing %s volume(s) for removed replica %d: %v", family.ServiceKey, replica, err)
	}

	removePatroniNodeServiceData(pd, family, replica)

	return nil
}

// isAmongRemovedReplicas reports whether name matches one of the nodes
// a scale-down from currentReplicas to replicas is about to remove
// (replica numbers replicas+1..currentReplicas) — the exact set
// ScalePatroniFamily's scale-down branch loops over below.
func isAmongRemovedReplicas(name string, family patroniFamily, replicas, currentReplicas uint64) bool {
	for r := replicas + 1; r <= currentReplicas; r++ {
		if name == fmt.Sprintf("%s%d", family.NamePrefix, r) {
			return true
		}
	}
	return false
}

// refreshPatroniNodesEnv rolls PATRONI_NUM_NODES=numNodes out to nodes
// fromReplica..toReplica (inclusive) of the given family, one at a time,
// via a normal Swarm rolling update. Each restart re-runs entrypoint.sh,
// which recomputes PATRONI_PARTNER_ADDRS from the new value.
//
// stopFirst should be true when scaling DOWN: the surviving node's current
// process still has partner_addrs pointing at peers that no longer exist,
// so it should stop cleanly before the new one starts with the trimmed
// list, instead of the (mismatched) old and new instances running at once.
// When scaling UP the default start-first order is fine — the existing
// peers keep serving on their previous partner list until each restarts.
func refreshPatroniNodesEnv(
	pd *pt.PlatformData,
	dc *pt.DockerClient,
	family patroniFamily,
	fromReplica, toReplica, numNodes int,
	stopFirst bool,
) (string, error) {
	warningMessages := ""

	for replica := fromReplica; replica <= toReplica; replica++ {
		serviceName := fmt.Sprintf("%s%d", family.NamePrefix, replica)
		fmt.Printf("\nUpdating %s to cluster size %d:", serviceName, numNodes)

		svc, err := utils.GetSwarmServiceByName(dc, serviceName)
		if err != nil {
			return warningMessages, fmt.Errorf("error inspecting %s service: %v", serviceName, err)
		}

		if stopFirst {
			svc.Spec.UpdateConfig.Order = swarm.UpdateOrderStopFirst
			svc.Spec.RollbackConfig.Order = swarm.UpdateOrderStopFirst
		}

		updateResult, err := ServiceUpdate(pd, dc, svc, serviceName, ServiceUpdateOptions{
			Env: map[string]string{
				"PATRONI_NUM_NODES": fmt.Sprintf("%d", numNodes),
			},
		})
		if err != nil {
			return warningMessages, fmt.Errorf("error updating %s service: %v", serviceName, err)
		}
		warningMessages += updateResult.Warnings
	}

	return warningMessages, nil
}

// ScalePatroniFamily grows or shrinks a Patroni cluster (patroni_admin or
// patroni_metrics) to the target number of nodes. Called from
// ScaleSwarmService's "patroni_admin"/"patroni_metrics" cases the same way
// its "nats" case delegates to the NATS-specific logic further down.
func ScalePatroniFamily(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily, replicas uint64) (string, error) {
	if replicas == 0 {
		return "", fmt.Errorf("%s requires at least 1 node", family.ServiceKey)
	}
	if replicas != 1 && utils.IsEven(replicas) {
		return "", fmt.Errorf(
			"%s requires an odd number of nodes: (1, 3, 5, ...) so the embedded-Raft DCS always has an "+
				"unambiguous majority", family.ServiceKey)
	}

	currentReplicas, err := GetPatroniFamilyReplicas(dc, family)
	if err != nil {
		return "", fmt.Errorf("error getting current %s node count: %v", family.ServiceKey, err)
	}
	if currentReplicas == replicas {
		return fmt.Sprintf("%s is already scaled to %d node(s)", family.ServiceKey, replicas), nil
	}

	// From here on PATRONI_NUM_NODES must reflect the TARGET size: both
	// newly created nodes and the ServiceUpdate calls that refresh every
	// surviving node's env need to see it. Not written to disk yet — this
	// function does that itself at the very end, only once every step
	// below has succeeded (see the WritePlatformDataToFile call below).
	family.SetNumNodes(&pd.PlatformInfo, int(replicas))

	warningMessages := ""

	if replicas > currentReplicas {
		// ── SCALE UP ────────────────────────────────────────────────
		// Safe to refresh haproxy_patroni's config for the target size
		// right away, before creating anything: this only ADDS backend
		// entries to what's already there, so every currently-live node
		// (including whoever's already primary) stays listed the whole
		// time — no redundancy is ever lost. See
		// refreshHaproxyPatroniConfig's own doc comment for why this
		// matters at all, and the SCALE DOWN branch below for why scale
		// down can't do this quite so early.
		if err := refreshHaproxyPatroniConfig(pd, dc, family, replicas); err != nil {
			return "", fmt.Errorf("error refreshing haproxy_patroni config: %v", err)
		}

		fmt.Println("")
		for replica := int(currentReplicas) + 1; replica <= int(replicas); replica++ {
			if err := createPatroniNode(pd, dc, family, replica); err != nil {
				return "", err
			}
		}
		for replica := int(currentReplicas) + 1; replica <= int(replicas); replica++ {
			serviceName := fmt.Sprintf("%s%d", family.NamePrefix, replica)
			if err := waitUntilServiceTaskIsRunning(dc, serviceName); err != nil {
				return "", fmt.Errorf("error waiting for '%s' to be running: %v", serviceName, err)
			}
		}

		warnings, err := refreshPatroniNodesEnv(pd, dc, family, 1, int(currentReplicas), int(replicas), false)
		if err != nil {
			return "", err
		}
		warningMessages += warnings
	} else {
		// ── SCALE DOWN ──────────────────────────────────────────────
		
		// Check whether the CURRENT leader is among the nodes about to
		// be removed, and — if so — move leadership to node 1 ONCE,
		// before removing ANY of them, not interleaved with the
		// removal loop below (i.e. not "check before each node,
		// re-checking again after every removal"). The Raft group
		// needs to still have every original member when it's asked to
		// write the failover key: removing even one member outside its
		// own reconfiguration protocol can leave a brief window of DCS
		// instability right after, and interleaving the check
		// per-removed-node means later checks land inside exactly that
		// window — which in testing produced a transient 503
		// ("failed to write failover key into DCS") from Patroni after
		// the first of several nodes had already been removed. See
		// queryPatroniLeader / switchoverToNode1 below.
		//
		// Deliberately runs against haproxy_patroni's CURRENT config
		// (still listing every node, not yet shrunk to the target) —
		// see the refreshHaproxyPatroniConfig call further down for
		// why the order matters: shrinking the config to the target
		// size has to wait until node 1 is confirmed to actually BE
		// the leader, or haproxy_patroni's health check on it
		// legitimately fails (Patroni's own /primary correctly returns
		// 503 for a node that isn't primary yet), and with the config
		// already shrunk to just node 1, there'd be nothing else left
		// for the listener to route to at all — confirmed against real
		// haproxy_patroni logs ("Server admin-primary/patroni_admin1
		// is DOWN, reason: Layer7 wrong status, code: 503") after an
		// earlier version of this function shrank the config too
		// early, before the switchover below had a chance to run.
		fmt.Printf("Checking %s leadership before removing any nodes\n\n", family.ServiceKey)
		leader, err := queryPatroniLeader(pd, dc, family)
		if err != nil {
			return "", fmt.Errorf("checking current %s leader before scaling down: %v", family.ServiceKey, err)
		}
		if isAmongRemovedReplicas(leader, family, replicas, currentReplicas) {
			if err := switchoverToNode1(pd, dc, family); err != nil {
				return "", fmt.Errorf("moving %s leadership to node 1 before scaling down: %v", family.ServiceKey, err)
			}
		}
		
		// Only now — with node 1 guaranteed to actually be the leader,
		// either because it already was or because the switchover
		// above just confirmed it — is it safe to shrink
		// haproxy_patroni's config to the target size. From here on,
		// haproxy_patroni is checking against the CORRECT backend list
		// for the rest of this scale-down (the node-removal loop right
		// below), instead of continuing to check entries that are
		// about to disappear. See refreshHaproxyPatroniConfig's own
		// doc comment for the DNS side of why that matters too.
		if err := refreshHaproxyPatroniConfig(pd, dc, family, replicas); err != nil {
			return "", fmt.Errorf("error refreshing haproxy_patroni config: %v", err)
		}
		
		fmt.Printf("\nRemoving extra %s nodes\n", family.ServiceKey)
		for replica := int(replicas) + 1; replica <= int(currentReplicas); replica++ {
			if err := removePatroniNode(pd, dc, family, replica); err != nil {
				return "", err
			}
		}

		// N-to-1 is the one scale-down shape this platform currently
		// makes safe against Raft membership itself, not just against
		// an orphaned leader lock: once every other node is gone, node
		// 1's on-disk Raft journal still reflects the OLD (N-member)
		// membership, and Raft's own reconfiguration protocol can never
		// accept "we're down to 1" from there — it needs a majority of
		// the membership that no longer has anywhere to get votes from.
		// The only way out is wiping that journal so node 1 bootstraps
		// fresh as a 1-member group — confirmed against a real stuck
		// cluster, not just reasoned about (see ResetNode1Raft's doc
		// comment in system_manager for the fuller story).
		//
		// Scoped deliberately to replicas==1: an N-to-M scale-down with
		// M>1 survivors would need those M nodes to reconcile a fresh
		// membership AMONG THEMSELVES, not just wipe one node's journal
		// — a materially different problem this doesn't attempt to
		// solve yet.
		//
		// This only wipes the journal on disk, in place — it does NOT
		// itself restart node 1. That's refreshPatroniNodesEnv below,
		// immediately after, which restarts every surviving node
		// (node 1 alone, here) to push the new PATRONI_NUM_NODES
		// anyway — the empty journal takes effect as a side effect of
		// that same restart, with no separate forced-restart step
		// needed.

		if replicas == 1 {
			if err := resetNode1Raft(pd, dc, family); err != nil {
				return "", fmt.Errorf("resetting %s node 1's raft state before finishing scale-down: %v", family.ServiceKey, err)
			}
		}

		warnings, err := refreshPatroniNodesEnv(pd, dc, family, 1, int(replicas), int(replicas), true)
		if err != nil {
			return "", err
		}
		warningMessages += warnings
	}

	if err := waitUntilAllContainersAreHealthy(pd, family.NamePrefix); err != nil {
		return "", fmt.Errorf("error waiting for %s containers to be healthy: %v", family.ServiceKey, err)
	}

	// Unlike "nats" — which relies on ScaleSwarmService's shared tail
	// (FindServiceDataByName(pd, "nats") + WritePlatformDataToFile) —
	// patroni_admin/patroni_metrics have no single ServicesData entry for
	// that tail to find (see addPatroniNodeServiceData above), so this
	// persists everything itself: NumPatroniAdminNodes/NumPatroniMetricsNodes
	// (set earlier in this function) and the per-node ServicesData entries
	// added/removed above.
	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return warningMessages, fmt.Errorf("error writing platform data to file: %v", err)
	}

	return warningMessages, nil
}

// ── Leader check / switchover via system_manager ──────────────────────────
//
// patroni_sidecar's REST API (see patroni_sidecar/main.go) is only
// reachable inside patroni_net — this CLI, like nats_replicas.go's
// deploy_cli, runs as a host binary outside the Swarm overlay network, so
// it can't call it directly. Instead it goes through system_manager over
// NATS, exactly the way it already reaches nats1 for JetStream admin
// calls: connect as deploy_cli via its Nkey identity, to nats1's node IP
// (not its overlay DNS alias, same reasoning as
// connectDeployCliToNats's own doc comment), and do a plain NATS
// request/reply — no new connection machinery needed, just reusing
// getNats1NodeIP/connectDeployCliToNats as they already stand.
//
// system_manager's micro-service framework (see natssvc.go) signals a
// failed task via NATS message headers (Nats-Service-Error /
// Nats-Service-Error-Code) rather than a special payload shape — that's
// the nats.go "micro" package's own convention, not something specific
// to this platform — so both calls below check msg.Header for that
// before trying to parse msg.Data as the success payload.

// natsQueryTimeout bounds the /leader lookup — a fast, read-only HTTP
// proxy chain (system_manager → haproxy_patroni → patroni_sidecar →
// local Patroni), not expected to ever legitimately take long.
const natsQueryTimeout = 15 * time.Second

// natsSwitchoverTimeout bounds the switchover request. Must comfortably
// exceed system_manager's own internal budget for SwitchoverToNode1
// (up to ~20s to request the switchover + ~30s polling to confirm it,
// per system_manager/internal/patroni/patroni.go) — otherwise this call
// could time out on the CLI side while system_manager is still
// legitimately working, well before it's actually failed.
const natsSwitchoverTimeout = 90 * time.Second

// patroniLeaderInfo mirrors the fields this CLI needs from
// system_manager's leaderResponse (internal/patroni/patroni.go);
// encoding/json ignores the other fields (Members) it doesn't ask for.
type patroniLeaderInfo struct {
	Leader string `json:"leader"`
}

// connectToSystemManagerNats connects to NATS as deploy_cli, the same
// way nats_replicas.go's reduceNatsStreamsReplicas does for its own
// JetStream admin calls. Callers are responsible for nc.Drain()ing the
// returned connection.
// natsRequestRetries and natsRequestRetryWait bound how many times, and
// how far apart, requestSystemManager retries a NATS request that fails
// outright (no reply at all — a bare connection EOF/timeout/refused) or
// comes back as a system_manager service-level error. Every one of
// queryPatroniLeader, switchoverToNode1, and resetNode1Raft has been
// observed failing this way during real scale-down testing — not at
// one fixed point, but wherever in the sequence happens to land inside
// whatever transient unavailability window is open at that moment
// (haproxy_patroni's own containers recreating after a config change,
// Patroni's REST API briefly not answering during a membership change,
// etc.). Retrying at this single shared layer, rather than chasing down
// and separately hardening each call site against whatever caused ITS
// particular failure, is both simpler and also covers causes not yet
// identified.
//
// Variables, not constants, purely so tests can shorten them — every
// real caller uses the values set here.
var (
	natsRequestRetries   = 3
	natsRequestRetryWait = 5 * time.Second
)

// connectToSystemManagerNats connects to NATS as deploy_cli, the same
// way nats_replicas.go's reduceNatsStreamsReplicas does for its own
// JetStream admin calls.
func connectToSystemManagerNats(pd *pt.PlatformData, dc *pt.DockerClient) (*nats.Conn, error) {
	nodeIP, err := getNats1NodeIP(dc)
	if err != nil {
		return nil, fmt.Errorf("error getting nats1 node IP: %w", err)
	}
	nc, err := connectDeployCliToNats(pd, nodeIP)
	if err != nil {
		return nil, err
	}
	return nc, nil
}

// natsServiceError extracts a nats.go "micro" package service error from
// a reply message, or "" if msg doesn't carry one. See the file-level
// comment above.
func natsServiceError(msg *nats.Msg) string {
	if msg.Header == nil {
		return ""
	}
	return msg.Header.Get("Nats-Service-Error")
}

// requestSystemManager sends one NATS request/reply to system_manager
// and returns its raw reply body, retrying up to natsRequestRetries
// times (waiting natsRequestRetryWait between attempts) on any failure
// — a connection-level error from nc.Request, or a service-level error
// reported via natsServiceError. See the constants' doc comment above
// for why retrying generically here, rather than per call site, is the
// right layer for this. A fresh NATS connection is used for every
// attempt, not reused across retries, since a failed attempt's
// connection could itself be the thing that's stale/broken.
func requestSystemManager(pd *pt.PlatformData, dc *pt.DockerClient, subject string, timeout time.Duration) ([]byte, error) {
	var lastErr error
	for attempt := 1; attempt <= natsRequestRetries; attempt++ {
		data, err := requestSystemManagerOnce(pd, dc, subject, timeout)
		if err == nil {
			return data, nil
		}
		lastErr = err
		if attempt < natsRequestRetries {
			time.Sleep(natsRequestRetryWait)
		}
	}
	return nil, fmt.Errorf("after %d attempts: %w", natsRequestRetries, lastErr)
}

func requestSystemManagerOnce(pd *pt.PlatformData, dc *pt.DockerClient, subject string, timeout time.Duration) ([]byte, error) {
	nc, err := connectToSystemManagerNats(pd, dc)
	if err != nil {
		return nil, err
	}
	defer nc.Drain()

	msg, err := nc.Request(subject, nil, timeout)
	if err != nil {
		return nil, fmt.Errorf("requesting %s: %w", subject, err)
	}
	if errDesc := natsServiceError(msg); errDesc != "" {
		return nil, fmt.Errorf("%s: %s", subject, errDesc)
	}
	return msg.Data, nil
}

// queryPatroniLeader asks system_manager who family's current Patroni
// leader is (e.g. "patroni_admin3"), via GET-equivalent NATS
// request/reply against system_manager.patroni.leader.<name>. An empty
// return with a nil error means no leader is currently known (Patroni
// mid-failover) — see LeaderQuery's doc comment in system_manager — not
// that this call failed.
func queryPatroniLeader(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily) (string, error) {
	subject := "system_manager.patroni.leader." + family.SystemManagerName
	data, err := requestSystemManager(pd, dc, subject, natsQueryTimeout)
	if err != nil {
		return "", err
	}

	var info patroniLeaderInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return "", fmt.Errorf("decoding response from %s: %w", subject, err)
	}
	return info.Leader, nil
}

// switchoverToNode1 asks system_manager to move family's leadership to
// node 1, blocking until it's confirmed (or definitively failed) —
// SwitchoverToNode1.Run does that whole wait synchronously on the
// system_manager side before replying, so a plain successful return
// here already means the switchover is done, not just requested. See
// SwitchoverToNode1 in system_manager/internal/patroni/patroni.go.
func switchoverToNode1(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily) error {
	subject := "system_manager.patroni.switchover." + family.SystemManagerName
	fmt.Printf("Requesting %s leadership switchover to node 1\n\n", family.ServiceKey)
	_, err := requestSystemManager(pd, dc, subject, natsSwitchoverTimeout)
	return err
}

// resetNode1Raft asks system_manager to wipe family's node 1's local
// Raft/DCS state on disk — see ResetNode1Raft in
// system_manager/internal/patroni/patroni.go, and the comment at this
// function's call site in ScalePatroniFamily, for the full story on
// when and why this is needed. Only wipes the journal; does not itself
// restart node 1 — the caller (ScalePatroniFamily) relies on
// refreshPatroniNodesEnv's own restart of node 1, immediately after, to
// actually pick up the change.
func resetNode1Raft(pd *pt.PlatformData, dc *pt.DockerClient, family patroniFamily) error {
	subject := "system_manager.patroni.reset_raft." + family.SystemManagerName
	_, err := requestSystemManager(pd, dc, subject, natsQueryTimeout)
	return err
}