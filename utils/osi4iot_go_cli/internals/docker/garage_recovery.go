package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"sort"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/pkg/stdcopy"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// This file recovers a state file backup from a Garage deployment whose
// platform is stopped — the one case the rest of the recovery story
// doesn't cover.
//
// With AWS S3 the bucket is reachable whatever the platform is doing.
// With Garage stopped there is no endpoint at all: the objects sit in
// the garage_meta_<N> / garage_data_<N> volumes on the nodes that ran
// its instances, and the only way to read them is to put a Garage in front of
// those volumes again.
//
// # No credentials needed
//
// Garage does not encrypt its metadata with anything the operator has
// to supply. The node's identity is its node_key, which
// lives in the metadata directory; the RPC secret only authenticates
// nodes and CLIs to each other. So the temporary Garage gets a freshly
// generated configuration, and reading needs a key that this procedure
// imports itself, uses, and deletes.
//
// That key is named with the provisioning's prefix (osi4iot-…) on
// purpose: should the cleanup not run, the next start of the real
// garage service deletes it as a key it manages but no longer wants.
//
// # Nothing is exposed to the network
//
// The container publishes no port and joins no overlay. Everything —
// `garage json-api` to import the key and grant it read access, rclone
// against 127.0.0.1:3900 to list and download — runs INSIDE it through
// the Docker exec API, over the same connection (local or SSH) the CLI
// already has to the node.

const (
	// recoveryContainerName is fixed so that a run interrupted before
	// its cleanup leaves something findable, which the next attempt
	// clears instead of failing on a name clash.
	recoveryContainerName = "osi4iot-recovery-garage"
	recoveryConfigPath    = "/tmp/garage-recovery.toml"
	recoveryKeyName       = "osi4iot-recovery"

	// stateFileMarker identifies backup objects among everything else
	// in the bucket, matching the prefix ui/form/actions.go builds
	// ("s3://<bucket>/backups/state_file") and the ".enc" suffix
	// system_manager's statefile package names runs with.
	stateFileMarker = "state_file/"
	stateFileSuffix = ".enc"
)

// garageVolumeInstances lists the Garage instances whose two volumes
// (garage_meta_<ID>, garage_data_<ID>) are on the target, lowest ID
// first.
func garageVolumeInstances(ctx context.Context, target *RecoveryTarget) ([]int, error) {
	list, err := target.Cli.VolumeList(ctx, volume.ListOptions{Filters: filters.NewArgs()})
	if err != nil {
		return nil, fmt.Errorf("error listing volumes on %s: %w", target.Name, err)
	}
	found := map[string]bool{}
	for _, v := range list.Volumes {
		found[v.Name] = true
	}
	var ids []int
	for name := range found {
		var id int
		if _, err := fmt.Sscanf(name, "garage_meta_%d", &id); err != nil {
			continue
		}
		if name == utils.GarageMetaVolumeName(id) && found[utils.GarageDataVolumeName(id)] {
			ids = append(ids, id)
		}
	}
	sort.Ints(ids)
	return ids, nil
}

// GarageVolumeHost is a node holding the volumes of one or more Garage
// instances.
type GarageVolumeHost struct {
	Target    *RecoveryTarget
	Instances []int
}

// FindGarageVolumeHosts keeps the targets that hold Garage volumes.
func FindGarageVolumeHosts(ctx context.Context, targets []*RecoveryTarget) ([]GarageVolumeHost, error) {
	var hosts []GarageVolumeHost
	for _, t := range targets {
		ids, err := garageVolumeInstances(ctx, t)
		if err != nil {
			return nil, err
		}
		if len(ids) > 0 {
			hosts = append(hosts, GarageVolumeHost{Target: t, Instances: ids})
		}
	}
	return hosts, nil
}

// tempGarageMember is one temporary Garage: one instance's volumes, on
// the node that holds them.
type tempGarageMember struct {
	target      *RecoveryTarget
	instanceID  int
	name        string // container name; resolvable on the recovery network
	containerID string
	nodeID      string
}

// TempGarage is a throwaway Garage cluster started against existing
// volumes — one container per instance found, each on its own node —
// to read a stopped platform's object store. Always defer Stop.
type TempGarage struct {
	members []*tempGarageMember

	// The recovery network, when there is more than one member: a
	// bridge on the single host holding every instance, or an overlay
	// created through a swarm manager when they are on several nodes.
	// Internal either way: nothing outside the members reaches it.
	netTarget *RecoveryTarget
	netName   string

	ctx         context.Context
	key         pt.S3Credentials
	keyImported bool

	// LayoutInstances is how many instances the cluster's layout has;
	// Found how many of them are running here. Degraded is true when
	// some were missing and the members run with read quorum 1.
	LayoutInstances int
	Found           int
	Degraded        bool
}

// errReplicationFactor marks a start that failed because the volumes'
// layout was written with another replication factor.
var errReplicationFactor = errors.New("replication factor does not match the stored layout")

const recoveryNetworkName = "osi4iot-recovery-garage"

// StartTempGarage brings the Garage cluster back up from the volumes on
// hosts, as temporary containers with no access from outside, and gives
// a temporary key read access to every bucket.
//
// # One instance
//
// A local deployment (replication factor 1), or what is left of a
// cluster. Started alone, with no network; the replication factor must
// match the stored layout or Garage refuses to start, and with no state
// file there is nothing to read it from, so 1 is tried, then 3 — with
// consistency mode "dangerous" (read and write quorum 1), the only way a
// lone member of a three-copy cluster can answer.
//
// # Several instances
//
// Every instance found gets its own temporary Garage, on its own node,
// on a recovery network: they reconnect to each other (their identities
// are in their volumes, the stored layout says where each belongs) and
// serve the data as the cluster did. Then:
//
//   - every instance of the layout present: normal consistency;
//   - one or two missing: every object still has at least one copy among
//     those present (replication factor 3), so the members are restarted
//     in "dangerous" mode, which reads from a single copy;
//   - more missing: some objects may have no copy left. Refused, rather
//     than presenting a partial listing as complete.
//
// image should be the Garage version the platform ran: a newer one may
// want to migrate the metadata format, which is not something to meet
// halfway through a recovery.
func StartTempGarage(ctx context.Context, hosts []GarageVolumeHost, manager *RecoveryTarget, image string) (*TempGarage, error) {
	if image == "" {
		image = utils.DefaultGarageImage
	}
	total := 0
	for _, h := range hosts {
		total += len(h.Instances)
	}
	if total == 0 {
		return nil, fmt.Errorf("no Garage volumes (garage_meta_<N> and garage_data_<N>) found.\n" +
			"They are on the nodes that ran Garage — 'docker volume ls' there will confirm it.\n" +
			"If 'osi4iot delete' was run, the volumes are gone and so are the backups")
	}

	if total == 1 {
		var lastErr error
		for _, rf := range []int{1, utils.GarageClusterReplicationFactor} {
			tg := newTempGarage(ctx, hosts)
			err := tg.start(ctx, image, rf, rf > 1)
			if err == nil {
				tg.Found, tg.LayoutInstances, tg.Degraded = 1, 1, rf > 1
				if err = tg.grantReadAccess(ctx); err == nil {
					return tg, nil
				}
			}
			tg.Stop()
			lastErr = err
			if !errors.Is(err, errReplicationFactor) {
				break
			}
		}
		return nil, lastErr
	}

	// Several instances: a cluster, replication factor 3.
	tg := newTempGarage(ctx, hosts)
	if len(hosts) > 1 && manager == nil {
		return nil, fmt.Errorf("the Garage volumes are on %d nodes; joining them needs a swarm "+
			"manager to create the recovery network, and none could be reached", len(hosts))
	}
	if err := tg.createNetwork(ctx, hosts, manager); err != nil {
		return nil, err
	}
	if err := tg.start(ctx, image, utils.GarageClusterReplicationFactor, false); err != nil {
		tg.Stop()
		return nil, err
	}
	if err := tg.join(ctx); err != nil {
		tg.Stop()
		return nil, err
	}

	rf := utils.GarageClusterReplicationFactor
	dangerous, err := recoveryReadMode(tg.LayoutInstances, tg.Found, rf)
	if err != nil {
		tg.Stop()
		return nil, err
	}
	if dangerous {
		// Restart every member with read quorum 1.
		tg.removeContainers()
		if err := tg.start(ctx, image, rf, true); err != nil {
			tg.Stop()
			return nil, err
		}
		if err := tg.join(ctx); err != nil {
			tg.Stop()
			return nil, err
		}
		tg.Degraded = true
	}

	if err := tg.grantReadAccess(ctx); err != nil {
		tg.Stop()
		return nil, err
	}
	return tg, nil
}

// recoveryReadMode decides how a rejoined cluster can be read, from how
// many instances its layout has and how many were found: normally when
// all are there; with read quorum 1 ("dangerous") when at most rf-1 are
// missing, since every object then still has a copy among those found;
// not at all when more are missing.
func recoveryReadMode(layoutInstances, found, rf int) (dangerous bool, err error) {
	missing := layoutInstances - found
	switch {
	case missing <= 0:
		return false, nil
	case missing <= rf-1:
		return true, nil
	default:
		return false, fmt.Errorf("only %d of the %d Garage instances were found. With %d copies "+
			"of every object, more than %d missing instances means some objects may have no "+
			"copy left; reach the nodes holding the others (their volumes are garage_meta_<N> "+
			"and garage_data_<N>) and run this again", found, layoutInstances, rf, rf-1)
	}
}

// newTempGarage plans one member per instance volume pair found. Member
// names carry the host's index too: instance numbers are reused, so a
// node that was unreachable when an instance was retired may still hold
// volumes with the same number as a live instance elsewhere, and two
// containers with one name on the recovery network would be ambiguous.
func newTempGarage(ctx context.Context, hosts []GarageVolumeHost) *TempGarage {
	tg := &TempGarage{
		ctx: ctx,
		key: pt.S3Credentials{
			AccessKeyID:     utils.GenerateGarageAccessKeyID(),
			SecretAccessKey: utils.GenerateGarageSecretAccessKey(),
		},
	}
	for hostIndex, h := range hosts {
		for _, id := range h.Instances {
			tg.members = append(tg.members, &tempGarageMember{
				target:     h.Target,
				instanceID: id,
				name:       fmt.Sprintf("%s-%d-%d", recoveryContainerName, hostIndex+1, id),
			})
		}
	}
	return tg
}

// createNetwork creates the internal network the members talk over.
func (t *TempGarage) createNetwork(ctx context.Context, hosts []GarageVolumeHost, manager *RecoveryTarget) error {
	t.netName = recoveryNetworkName
	opts := network.CreateOptions{
		Internal: true,
		Labels:   map[string]string{"app": "osi4iot", "osi4iot.role": "recovery"},
	}
	if len(hosts) == 1 {
		t.netTarget = hosts[0].Target
		opts.Driver = "bridge"
	} else {
		t.netTarget = manager
		opts.Driver = "overlay"
		// Attachable: standalone containers on any node may join it.
		opts.Attachable = true
	}
	_ = t.netTarget.Cli.NetworkRemove(ctx, t.netName) // left over by an interrupted run
	if _, err := t.netTarget.Cli.NetworkCreate(ctx, t.netName, opts); err != nil {
		t.netTarget = nil
		return fmt.Errorf("error creating the recovery network on %s: %w", hosts[0].Target.Name, err)
	}
	return nil
}

// start creates and starts every member with the same fresh
// configuration, and waits until each answers on its RPC.
func (t *TempGarage) start(ctx context.Context, image string, rf int, dangerous bool) error {
	// Fresh secrets shared by the members; no peers — they are joined
	// by join() once running.
	scratch := pt.PlatformInfo{
		S3BucketType:            utils.S3BucketTypeGarage,
		GarageReplicationFactor: rf,
		GarageRPCSecret:         utils.GenerateHexKey(32),
		GarageAdminToken:        utils.GenerateHexKey(32),
		GarageMetricsToken:      utils.GenerateHexKey(32),
	}
	config := utils.GarageConfigToml(scratch)
	if dangerous {
		config = strings.Replace(config, `consistency_mode = "consistent"`, `consistency_mode = "dangerous"`, 1)
	}

	for _, m := range t.members {
		removeStaleContainer(ctx, m.target.Cli, m.name)
		if err := ensureImage(ctx, m.target.Cli, image); err != nil {
			return fmt.Errorf("on %s: %w", m.target.Name, err)
		}

		hostConfig := &container.HostConfig{
			NetworkMode: "none",
			Mounts: []mount.Mount{
				{Type: mount.TypeVolume, Source: utils.GarageMetaVolumeName(m.instanceID), Target: "/var/lib/garage/meta"},
				{Type: mount.TypeVolume, Source: utils.GarageDataVolumeName(m.instanceID), Target: "/var/lib/garage/data"},
			},
		}
		var netConfig *network.NetworkingConfig
		if t.netName != "" {
			hostConfig.NetworkMode = container.NetworkMode(t.netName)
			netConfig = &network.NetworkingConfig{EndpointsConfig: map[string]*network.EndpointSettings{
				t.netName: {Aliases: []string{m.name}},
			}}
		}

		created, err := m.target.Cli.ContainerCreate(ctx,
			&container.Config{
				Image:    image,
				Hostname: m.name,
				// Bypass the image's entrypoint: no provisioning here, only
				// the server, with a configuration written from the
				// environment (a standalone container cannot mount a Swarm
				// secret). The volumes already hold the instance's node_key.
				Entrypoint: []string{"sh", "-c",
					`printf '%s' "$GARAGE_RECOVERY_TOML" > "$GARAGE_CONFIG_FILE" && exec garage server`},
				Env: []string{
					"GARAGE_CONFIG_FILE=" + recoveryConfigPath,
					"GARAGE_RECOVERY_TOML=" + config,
				},
				Labels: map[string]string{
					"app":          "osi4iot",
					"osi4iot.role": "recovery",
					"service_type": "garage_recovery",
				},
			}, hostConfig, netConfig, nil, m.name)
		if err != nil {
			return fmt.Errorf("error creating the temporary Garage for instance %d on %s "+
				"(is the image %s present there?): %w", m.instanceID, m.target.Name, image, err)
		}
		m.containerID = created.ID
		if err := m.target.Cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
			return fmt.Errorf("error starting the temporary Garage for instance %d on %s: %w",
				m.instanceID, m.target.Name, err)
		}
	}

	for _, m := range t.members {
		if err := t.waitServing(ctx, m); err != nil {
			logs := t.tailLogs(m)
			if strings.Contains(logs, "different than the one specified in the config file") {
				return errReplicationFactor
			}
			return fmt.Errorf("the temporary Garage for instance %d on %s did not start: %w\n"+
				"Is Garage itself still running somewhere? Two Garages must never "+
				"open the same volumes.%s", m.instanceID, m.target.Name, err, logs)
		}
	}
	return nil
}

// join connects every member to every other and waits until they see
// each other; it then records how many instances the layout has.
func (t *TempGarage) join(ctx context.Context) error {
	for _, m := range t.members {
		out, err := t.memberJSON(ctx, m, "GetNodeInfo", map[string]any{"node": "self", "body": nil})
		if err != nil {
			return fmt.Errorf("error reading the node ID of instance %d: %w", m.instanceID, err)
		}
		var info struct {
			Success map[string]json.RawMessage `json:"success"`
		}
		if err := json.Unmarshal([]byte(out), &info); err != nil || len(info.Success) != 1 {
			return fmt.Errorf("unexpected GetNodeInfo answer from instance %d", m.instanceID)
		}
		for id := range info.Success {
			m.nodeID = id
		}
	}

	for _, m := range t.members {
		var peers []string
		for _, other := range t.members {
			if other != m {
				peers = append(peers, fmt.Sprintf("%s@%s:%d", other.nodeID, other.name, utils.GarageRPCPort))
			}
		}
		if len(peers) == 0 {
			continue
		}
		var lastErr error
		for attempt := 0; attempt < 15; attempt++ {
			out, err := t.memberJSON(ctx, m, "ConnectClusterNodes", peers)
			lastErr = err
			if err == nil {
				var results []struct {
					Success bool    `json:"success"`
					Error   *string `json:"error"`
				}
				if json.Unmarshal([]byte(out), &results) == nil && allConnected(results) {
					break
				}
				lastErr = fmt.Errorf("not every peer answered: %s", strings.TrimSpace(out))
			}
			time.Sleep(2 * time.Second)
		}
		if lastErr != nil {
			return fmt.Errorf("the temporary Garage for instance %d could not reach the others "+
				"over the recovery network: %w", m.instanceID, lastErr)
		}
	}

	// The health report names how many storage nodes the layout has and
	// how many are connected.
	deadline := time.Now().Add(60 * time.Second)
	for {
		out, err := t.jsonAPI(ctx, "GetClusterHealth", nil)
		if err == nil {
			var health struct {
				StorageNodes   int `json:"storageNodes"`
				StorageNodesUp int `json:"storageNodesUp"`
			}
			if json.Unmarshal([]byte(out), &health) == nil && health.StorageNodes > 0 &&
				health.StorageNodesUp >= len(t.members) {
				t.LayoutInstances = health.StorageNodes
				t.Found = health.StorageNodesUp
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("the temporary Garage instances did not all join each other")
		}
		time.Sleep(2 * time.Second)
	}
}

func allConnected(results []struct {
	Success bool    `json:"success"`
	Error   *string `json:"error"`
}) bool {
	for _, r := range results {
		if !r.Success {
			return false
		}
	}
	return true
}

func (t *TempGarage) memberGarage(ctx context.Context, m *tempGarageMember, args ...string) (string, error) {
	stdout, stderr, code, err := execCapture(ctx, m.target.Cli, m.containerID,
		append([]string{"garage"}, args...), nil)
	if err != nil {
		return "", err
	}
	if code != 0 {
		return "", fmt.Errorf("garage %s: %s", args[0], strings.TrimSpace(stderr))
	}
	return stdout, nil
}

func (t *TempGarage) jsonAPI(ctx context.Context, endpoint string, payload any) (string, error) {
	return t.memberJSON(ctx, t.members[0], endpoint, payload)
}

func (t *TempGarage) memberJSON(ctx context.Context, m *tempGarageMember, endpoint string, payload any) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return t.memberGarage(ctx, m, "json-api", endpoint, string(body))
}

// waitServing waits for a member to answer on its RPC — not for `garage
// health`, which a cluster missing instances never passes. Fails at once
// if the container exits (a replication factor that does not match the
// stored layout makes Garage refuse to start).
func (t *TempGarage) waitServing(ctx context.Context, m *tempGarageMember) error {
	deadline := time.Now().Add(60 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
		if inspect, err := m.target.Cli.ContainerInspect(ctx, m.containerID); err == nil &&
			inspect.State != nil && !inspect.State.Running {
			return fmt.Errorf("Garage exited (code %d)", inspect.State.ExitCode)
		}
		if _, lastErr = t.memberJSON(ctx, m, "GetClusterStatus", nil); lastErr == nil {
			return nil
		}
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("timed out")
	}
	return lastErr
}

// grantReadAccess imports the temporary key and allows it to read every
// bucket — read only: nothing in a recovery has any reason to write.
func (t *TempGarage) grantReadAccess(ctx context.Context) error {
	// Retried: just after start the cluster may not serve table writes yet.
	var importErr error
	for attempt := 0; attempt < 30; attempt++ {
		if _, importErr = t.jsonAPI(ctx, "ImportKey", map[string]string{
			"accessKeyId":     t.key.AccessKeyID,
			"secretAccessKey": t.key.SecretAccessKey,
			"name":            recoveryKeyName,
		}); importErr == nil {
			break
		}
		time.Sleep(2 * time.Second)
	}
	if importErr != nil {
		return fmt.Errorf("error creating a temporary read key: %w", importErr)
	}
	t.keyImported = true

	out, err := t.jsonAPI(ctx, "ListBuckets", nil)
	if err != nil {
		return fmt.Errorf("error listing buckets: %w", err)
	}
	var buckets []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(out), &buckets); err != nil {
		return fmt.Errorf("unexpected ListBuckets answer: %w", err)
	}
	for _, b := range buckets {
		if _, err := t.jsonAPI(ctx, "AllowBucketKey", map[string]any{
			"bucketId":    b.ID,
			"accessKeyId": t.key.AccessKeyID,
			"permissions": map[string]bool{"read": true},
		}); err != nil {
			return fmt.Errorf("error granting read access: %w", err)
		}
	}
	return nil
}

// rclone runs rclone inside the first member against its own loopback,
// with the temporary key; that member serves the whole cluster's data.
func (t *TempGarage) rclone() *rcloneSource {
	m := t.members[0]
	return &rcloneSource{
		cli:         m.target.Cli,
		containerID: m.containerID,
		env:         rcloneEnv(fmt.Sprintf("http://127.0.0.1:%d", utils.GarageS3Port), t.key),
	}
}

// removeContainers removes every member's container.
func (t *TempGarage) removeContainers() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	for _, m := range t.members {
		if m.containerID != "" {
			_ = m.target.Cli.ContainerRemove(ctx, m.containerID, container.RemoveOptions{Force: true, RemoveVolumes: true})
			m.containerID = ""
		}
	}
}

// Stop deletes the temporary key, removes every container and the
// recovery network. Safe to call more than once, and worth calling as
// early as possible.
func (t *TempGarage) Stop() {
	if t == nil {
		return
	}
	// A fresh context: Stop is usually reached through a defer or a
	// signal handler, by which point the caller's may be cancelled.
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if t.keyImported && len(t.members) > 0 && t.members[0].containerID != "" {
		// Best effort: if it stays, the real cluster's provisioning
		// deletes it (it carries the osi4iot- prefix and is not in the
		// spec).
		_, _ = t.jsonAPI(ctx, "DeleteKey", map[string]string{"id": t.key.AccessKeyID})
		t.keyImported = false
	}
	t.removeContainers()
	if t.netTarget != nil {
		_ = t.netTarget.Cli.NetworkRemove(ctx, t.netName)
		t.netTarget = nil
	}
}

// tailLogs returns a member's last few lines, for the error path.
func (t *TempGarage) tailLogs(m *tempGarageMember) string {
	if m.containerID == "" {
		return ""
	}
	rc, err := m.target.Cli.ContainerLogs(t.ctx, m.containerID, container.LogsOptions{
		ShowStdout: true, ShowStderr: true, Tail: "10",
	})
	if err != nil {
		return ""
	}
	defer rc.Close()

	var stdout, stderr strings.Builder
	if _, err := stdcopy.StdCopy(&stdout, &stderr, io.LimitReader(rc, 64<<10)); err != nil {
		return ""
	}
	out := strings.TrimSpace(stdout.String() + "\n" + stderr.String())
	if out == "" {
		return ""
	}
	return "\n\nGarage said:\n" + out
}

// SwarmInfo is what a node's own Docker says about its place in the swarm.
type SwarmInfo struct {
	NodeID    string
	InSwarm   bool
	IsManager bool
	// ManagerHosts are the addresses of the managers this node knows —
	// a worker knows them all, which is how a recovery started on a
	// worker finds a manager without asking.
	ManagerHosts []string
}

// SwarmInfoOf reads a target's swarm membership from its own Docker.
func SwarmInfoOf(ctx context.Context, t *RecoveryTarget) (SwarmInfo, error) {
	info, err := t.Cli.Info(ctx)
	if err != nil {
		return SwarmInfo{}, err
	}
	sw := info.Swarm
	return SwarmInfo{
		NodeID:       sw.NodeID,
		InSwarm:      sw.LocalNodeState == swarm.LocalNodeStateActive,
		IsManager:    sw.ControlAvailable,
		ManagerHosts: managerHosts(sw.RemoteManagers, sw.NodeID),
	}, nil
}

// managerHosts turns the swarm's manager peers ("ip:2377") into SSH
// hosts, without this node itself and without duplicates.
func managerHosts(peers []swarm.Peer, self string) []string {
	seen := map[string]bool{}
	var hosts []string
	for _, p := range peers {
		if p.NodeID == self || p.Addr == "" {
			continue
		}
		host := p.Addr
		if h, _, err := net.SplitHostPort(p.Addr); err == nil {
			host = h
		}
		if !seen[host] {
			seen[host] = true
			hosts = append(hosts, host)
		}
	}
	return hosts
}

// SwarmNode is a node of the swarm as a manager lists it.
type SwarmNode struct {
	ID       string
	Address  string
	Hostname string
}

// ListSwarmNodes lists every node of the swarm through a manager. The
// platform's services are gone after `osi4iot stop`, but the swarm
// itself — and with it the list of machines — still exists.
func ListSwarmNodes(ctx context.Context, manager *RecoveryTarget) ([]SwarmNode, error) {
	nodes, err := manager.Cli.NodeList(ctx, types.NodeListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing the swarm nodes: %w", err)
	}
	out := make([]SwarmNode, 0, len(nodes))
	for _, n := range nodes {
		out = append(out, SwarmNode{ID: n.ID, Address: n.Status.Addr, Hostname: n.Description.Hostname})
	}
	return out, nil
}

// StateFileObject locates one backup inside the object store.
type StateFileObject struct {
	Bucket string
	Key    string
}

// Name is the run's identifier, the object key without its path or
// extension — the same name `osi4iot state list` shows.
func (o StateFileObject) Name() string {
	base := o.Key
	if i := strings.LastIndex(base, "/"); i >= 0 {
		base = base[i+1:]
	}
	return strings.TrimSuffix(base, stateFileSuffix)
}

// ListStateFileBackupsInGarage finds every state file backup in every
// bucket of the temporary Garage, newest first.
//
// It searches rather than asking for a bucket and prefix, because in
// the situation this runs in the operator has no state file to read them
// from — and the objects are recognizable on their own: under a
// "state_file/" path, ending in ".enc".
func ListStateFileBackupsInGarage(ctx context.Context, tg *TempGarage) ([]StateFileObject, error) {
	out, err := tg.jsonAPI(ctx, "ListBuckets", nil)
	if err != nil {
		return nil, fmt.Errorf("error listing buckets: %w", err)
	}
	var buckets []struct {
		GlobalAliases []string `json:"globalAliases"`
	}
	if err := json.Unmarshal([]byte(out), &buckets); err != nil {
		return nil, fmt.Errorf("unexpected ListBuckets answer: %w", err)
	}

	rc := tg.rclone()
	var found []StateFileObject
	for _, b := range buckets {
		if len(b.GlobalAliases) == 0 {
			continue
		}
		bucket := b.GlobalAliases[0]
		objects, err := rc.List(ctx, bucket, "")
		if err != nil {
			return nil, err
		}
		for _, obj := range objects {
			if strings.Contains(obj.Key, stateFileMarker) && strings.HasSuffix(obj.Key, stateFileSuffix) {
				found = append(found, StateFileObject{Bucket: bucket, Key: obj.Key})
			}
		}
	}

	// Run names are timestamps that sort lexicographically in
	// chronological order (see system_manager's statefile package), so
	// reversing gives newest first.
	sort.Slice(found, func(i, j int) bool { return found[i].Key > found[j].Key })
	return found, nil
}

// DownloadFromGarage fetches one backup's bytes.
func DownloadFromGarage(ctx context.Context, tg *TempGarage, obj StateFileObject) ([]byte, error) {
	body, err := tg.rclone().Get(ctx, obj.Bucket, obj.Key)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	data, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("error reading %s/%s: %w", obj.Bucket, obj.Key, err)
	}
	return data, nil
}
