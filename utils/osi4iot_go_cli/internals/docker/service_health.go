package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// `osi4iot service state` — is a stateful service working, and if not,
// why. For each service it reads, live:
//
//   - Swarm: does every instance have a running task, on which node, and
//     what does the container's health check say;
//   - the service itself, from inside its containers (so nothing depends
//     on ports being reachable from the manager, nor on NATS or
//     system_manager working): NATS's monitoring endpoint, Patroni's
//     REST API, Garage's admin API.
//
// The verdict has three levels:
//
//   - healthy: everything as it should be;
//   - degraded: it works, but with less redundancy than it should have
//     (an instance down, a replica not caught up…) — one more failure of
//     the same kind may take it down;
//   - down: it does not do its job (no leader, no quorum, nothing
//     answering).

// HealthLevel is the verdict on one service.
type HealthLevel int

const (
	HealthOK HealthLevel = iota
	HealthDegraded
	HealthDown
)

func (l HealthLevel) String() string {
	switch l {
	case HealthOK:
		return "healthy"
	case HealthDegraded:
		return "degraded"
	default:
		return "down"
	}
}

// ServiceHealth is what `service state` shows for one service.
type ServiceHealth struct {
	Service string
	Level   HealthLevel
	// NotUsed: the platform does not run this service at all (Garage
	// with the bucket on AWS S3). Not a failure.
	NotUsed bool
	Header  []string   // instance table
	Rows    [][]string //
	Notes   []string   // facts worth knowing, not problems
	// Problems explains a degraded or down verdict, one line each.
	Problems []string
	// Probe is the outcome of each step of --probe, "✓ …" or "✗ …"; a
	// failed step raises Level by itself.
	Probe []string
}

func (h *ServiceHealth) degraded(format string, args ...any) {
	if h.Level < HealthDegraded {
		h.Level = HealthDegraded
	}
	h.Problems = append(h.Problems, fmt.Sprintf(format, args...))
}

func (h *ServiceHealth) down(format string, args ...any) {
	h.Level = HealthDown
	h.Problems = append(h.Problems, fmt.Sprintf(format, args...))
}

func (h *ServiceHealth) note(format string, args ...any) {
	h.Notes = append(h.Notes, fmt.Sprintf(format, args...))
}

func (h *ServiceHealth) probeOK(format string, args ...any) {
	h.Probe = append(h.Probe, "✓ "+fmt.Sprintf(format, args...))
}

// probeFailed records a failed probe step and raises the verdict to at
// least level.
func (h *ServiceHealth) probeFailed(level HealthLevel, format string, args ...any) {
	if h.Level < level {
		h.Level = level
	}
	h.Probe = append(h.Probe, "✗ "+fmt.Sprintf(format, args...))
}

// HealthCheckedServices are the services `service state` knows how to
// check, in the order it shows them.
var HealthCheckedServices = []string{"nats", "patroni_admin", "patroni_metrics", utils.GarageServiceName}

// CheckServiceHealth checks one of HealthCheckedServices. With probe it
// also really uses the service — see service_probe.go.
func CheckServiceHealth(pd *pt.PlatformData, dc *pt.DockerClient, service string, probe bool) ServiceHealth {
	switch service {
	case "nats":
		return checkNatsHealth(pd, dc, probe)
	case "patroni_admin", "patroni_metrics":
		return checkPatroniHealth(pd, dc, service, probe)
	case utils.GarageServiceName:
		return checkGarageHealth(pd, dc, probe)
	}
	return ServiceHealth{Service: service, Level: HealthDown,
		Problems: []string{fmt.Sprintf("'%s' cannot be checked; it is one of: %s",
			service, strings.Join(HealthCheckedServices, ", "))}}
}

// ── Swarm side ───────────────────────────────────────────────────────

// swarmInstance is one Swarm service of a family (nats2, patroni_admin1,
// garage_3…) as Swarm sees it.
type swarmInstance struct {
	Service string
	Exists  bool
	NodeIP  string
	// Task is the state of the task Swarm wants running ("running",
	// "starting", "pending"…), or "no task".
	Task    string
	TaskErr string
	// Health is the container's health check: "healthy", "unhealthy",
	// "starting", "" (no health check), or why it could not be read.
	Health string

	containerID string
	ndc         *pt.DockerClient
}

func (si swarmInstance) running() bool { return si.containerID != "" }

// exec runs a command in the instance's container and returns its
// standard output; a non-zero exit is an error carrying the output.
func (si swarmInstance) exec(cmd ...string) (string, error) {
	if !si.running() {
		return "", fmt.Errorf("%s has no running container", si.Service)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	stdout, stderr, code, err := execCapture(ctx, si.ndc.Cli, si.containerID, cmd, nil)
	if err != nil {
		return "", err
	}
	if code != 0 {
		msg := strings.TrimSpace(stderr)
		if msg == "" {
			msg = strings.TrimSpace(stdout)
		}
		if msg == "" {
			msg = fmt.Sprintf("exit status %d", code)
		}
		return "", fmt.Errorf("%s", msg)
	}
	return stdout, nil
}

// familyServices lists the Swarm services whose name matches re (with
// the instance number as its first group), by number.
func familyServices(dc *pt.DockerClient, re *regexp.Regexp) ([]string, error) {
	services, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{})
	if err != nil {
		return nil, fmt.Errorf("error listing services: %w", err)
	}
	type numbered struct {
		name string
		n    int
	}
	var found []numbered
	for _, s := range services {
		if m := re.FindStringSubmatch(s.Spec.Name); m != nil {
			n, _ := strconv.Atoi(m[1])
			found = append(found, numbered{s.Spec.Name, n})
		}
	}
	sort.Slice(found, func(i, j int) bool { return found[i].n < found[j].n })
	names := make([]string, len(found))
	for i, f := range found {
		names[i] = f.name
	}
	return names, nil
}

// inspectSwarmInstance reads one single-replica service's task and, if
// it runs, finds its container on its node.
func inspectSwarmInstance(dc *pt.DockerClient, service string) swarmInstance {
	si := swarmInstance{Service: service, Task: "no task"}
	f := filters.NewArgs()
	f.Add("service", service)
	tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: f})
	if err != nil {
		si.Task = "unknown"
		si.TaskErr = err.Error()
		return si
	}
	si.Exists = true

	// The task Swarm wants running; else the latest one, for its error.
	var cur *swarm.Task
	for i := range tasks {
		t := &tasks[i]
		if t.DesiredState != swarm.TaskStateRunning {
			continue
		}
		if cur == nil || t.Status.Timestamp.After(cur.Status.Timestamp) {
			cur = t
		}
	}
	if cur == nil {
		var last *swarm.Task
		for i := range tasks {
			if last == nil || tasks[i].Status.Timestamp.After(last.Status.Timestamp) {
				last = &tasks[i]
			}
		}
		if last != nil {
			si.TaskErr = firstNonEmpty(last.Status.Err, last.Status.Message)
		}
		return si
	}
	si.Task = string(cur.Status.State)
	si.TaskErr = cur.Status.Err
	si.NodeIP = swarmNodeIP(dc, cur.NodeID)
	if cur.Status.State != swarm.TaskStateRunning {
		return si
	}

	ndc := pt.DCMap[si.NodeIP]
	if ndc == nil || ndc.Cli == nil {
		si.Health = "node not reachable from here"
		return si
	}
	id, err := runningServiceContainer(ndc, service)
	if err != nil {
		si.Health = err.Error()
		return si
	}
	si.containerID, si.ndc = id, ndc
	if insp, err := ndc.Cli.ContainerInspect(ndc.Ctx, id); err == nil && insp.State != nil && insp.State.Health != nil {
		si.Health = insp.State.Health.Status
	}
	return si
}

// swarmNodeIP is the address of a Swarm node, as the state file and
// DCMap know it.
func swarmNodeIP(dc *pt.DockerClient, nodeID string) string {
	if nodeID == "" {
		return ""
	}
	node, _, err := dc.Cli.NodeInspectWithRaw(dc.Ctx, nodeID)
	if err != nil {
		return ""
	}
	addr := node.Status.Addr
	if (addr == "" || addr == "0.0.0.0") && node.ManagerStatus != nil {
		if host, _, err := net.SplitHostPort(node.ManagerStatus.Addr); err == nil {
			addr = host
		}
	}
	return addr
}

// replicatedTasks counts a replicated service's running tasks against
// the replicas it asks for.
func replicatedTasks(dc *pt.DockerClient, service string) (running, desired int, err error) {
	s, _, err := dc.Cli.ServiceInspectWithRaw(dc.Ctx, service, types.ServiceInspectOptions{})
	if err != nil {
		return 0, 0, err
	}
	if s.Spec.Mode.Replicated != nil && s.Spec.Mode.Replicated.Replicas != nil {
		desired = int(*s.Spec.Mode.Replicated.Replicas)
	}
	f := filters.NewArgs()
	f.Add("service", service)
	f.Add("desired-state", "running")
	tasks, err := dc.Cli.TaskList(dc.Ctx, types.TaskListOptions{Filters: f})
	if err != nil {
		return 0, desired, err
	}
	for _, t := range tasks {
		if t.Status.State == swarm.TaskStateRunning {
			running++
		}
	}
	return running, desired, nil
}

// platformNodeName is how the platform calls a node (worker_2), or its address.
func platformNodeName(pd *pt.PlatformData, ip string) string {
	if ip == "" {
		return "-"
	}
	for _, n := range pd.PlatformInfo.NodesData {
		if n.NodeIP == ip && n.NodeLabel != "" {
			return n.NodeLabel
		}
	}
	return ip
}

// taskCell words an instance's Swarm state for the table.
func taskCell(si swarmInstance) string {
	switch {
	case !si.Exists:
		return "missing"
	case si.Task == "running" && si.Health != "" && si.Health != "healthy":
		return "running (" + si.Health + ")"
	default:
		return si.Task
	}
}

// swarmProblem says what is wrong with an instance on the Swarm side,
// or "" if it runs.
func swarmProblem(si swarmInstance) string {
	switch {
	case !si.Exists:
		return fmt.Sprintf("%s: the service does not exist in Swarm", si.Service)
	case si.Task != "running":
		msg := fmt.Sprintf("%s is not running (task %s)", si.Service, si.Task)
		if si.TaskErr != "" {
			msg += ": " + si.TaskErr
		}
		return msg
	case !si.running():
		return fmt.Sprintf("%s runs, but its container cannot be reached: %s", si.Service, si.Health)
	}
	return ""
}

func firstNonEmpty(s ...string) string {
	for _, v := range s {
		if v != "" {
			return v
		}
	}
	return ""
}

func dash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

func humanBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(b)/float64(div), "KMGTPE"[exp])
}

// ── NATS ─────────────────────────────────────────────────────────────

var natsServiceRe = regexp.MustCompile(`^nats(\d+)$`)

// natsInstanceView is what one NATS server says about itself.
type natsInstanceView struct {
	si         swarmInstance
	healthz    string // "ok", or why not
	serverName string
	version    string
	conns      int
	peers      int // distinct servers it has routes to
	metaLeader string
	metaPeers  []natsMetaPeer // the meta group as this server sees it
	jsErr      string
}

type natsMetaPeer struct {
	Name    string `json:"name"`
	Current bool   `json:"current"`
	Offline bool   `json:"offline"`
}

func readNatsInstance(si swarmInstance) natsInstanceView {
	v := natsInstanceView{si: si}
	if !si.running() {
		return v
	}
	get := func(path string, out any) error {
		raw, err := si.exec("wget", "-qO-", "http://localhost:8222"+path)
		if err != nil {
			return err
		}
		return json.Unmarshal([]byte(raw), out)
	}

	var hz struct {
		Status string `json:"status"`
		Error  string `json:"error"`
	}
	if err := get("/healthz", &hz); err != nil {
		// /healthz answers 503 when the server is not ready, which wget
		// reports as a failure without the body.
		v.healthz = "not ready (" + err.Error() + ")"
	} else if hz.Status != "ok" {
		v.healthz = firstNonEmpty(hz.Error, hz.Status)
	} else {
		v.healthz = "ok"
	}

	var varz struct {
		ServerName  string `json:"server_name"`
		Version     string `json:"version"`
		Connections int    `json:"connections"`
	}
	if get("/varz", &varz) == nil {
		v.serverName, v.version, v.conns = varz.ServerName, varz.Version, varz.Connections
	}

	var routez struct {
		Routes []struct {
			RemoteID string `json:"remote_id"`
		} `json:"routes"`
	}
	if get("/routez", &routez) == nil {
		seen := map[string]bool{}
		for _, r := range routez.Routes {
			if r.RemoteID != "" {
				seen[r.RemoteID] = true
			}
		}
		v.peers = len(seen)
	}

	var jsz struct {
		Meta *struct {
			Leader   string         `json:"leader"`
			Replicas []natsMetaPeer `json:"replicas"`
		} `json:"meta_cluster"`
	}
	if err := get("/jsz", &jsz); err != nil {
		v.jsErr = err.Error()
	} else if jsz.Meta != nil {
		v.metaLeader, v.metaPeers = jsz.Meta.Leader, jsz.Meta.Replicas
	}
	return v
}

func checkNatsHealth(pd *pt.PlatformData, dc *pt.DockerClient, probe bool) ServiceHealth {
	h := ServiceHealth{Service: "nats"}
	names, err := familyServices(dc, natsServiceRe)
	if err != nil {
		h.down("%v", err)
		return h
	}
	if len(names) == 0 {
		h.down("no NATS service is deployed")
		return h
	}
	var views []natsInstanceView
	for _, name := range names {
		views = append(views, readNatsInstance(inspectSwarmInstance(dc, name)))
	}
	var streams []NatsStreamInfo
	streamsErr := error(nil)
	if anyNatsReady(views) {
		streams, streamsErr = ListNatsStreams(pd, dc)
	}
	evaluateNats(&h, pd, views, streams, streamsErr)
	if probe {
		probeNats(&h, pd, views)
	}
	return h
}

func anyNatsReady(views []natsInstanceView) bool {
	for _, v := range views {
		if v.healthz == "ok" {
			return true
		}
	}
	return false
}

// evaluateNats turns what was read into the verdict. Pure, for tests.
func evaluateNats(h *ServiceHealth, pd *pt.PlatformData, views []natsInstanceView, streams []NatsStreamInfo, streamsErr error) {
	n := len(views)
	cluster := n > 1

	// The meta leader everyone agrees on, and the leader's own view of
	// its peers (only the leader knows whether they are current).
	leaders := map[string]int{}
	for _, v := range views {
		if v.metaLeader != "" {
			leaders[v.metaLeader]++
		}
	}
	leader := ""
	for name, votes := range leaders {
		if votes > leaders[leader] || (votes == leaders[leader] && name < leader) {
			leader = name
		}
	}

	h.Header = []string{"INSTANCE", "NODE", "TASK", "READY", "ROUTES", "JETSTREAM", "CLIENTS", "VERSION"}
	ready := 0
	for _, v := range views {
		routes, js, clients := "-", "-", "-"
		if v.si.running() {
			if cluster {
				routes = fmt.Sprintf("%d/%d", v.peers, n-1)
			}
			switch {
			case v.jsErr != "":
				js = "error"
			case !cluster:
				js = "standalone"
			case v.metaLeader == "":
				js = "no leader"
			case v.serverName != "" && v.serverName == v.metaLeader:
				js = "meta leader"
			default:
				js = "follower"
			}
			clients = strconv.Itoa(v.conns)
		}
		h.Rows = append(h.Rows, []string{v.si.Service, platformNodeName(pd, v.si.NodeIP), taskCell(v.si),
			dash(v.healthz), routes, js, clients, dash(v.version)})

		if p := swarmProblem(v.si); p != "" {
			h.degraded("%s", p)
			continue
		}
		if v.healthz != "ok" {
			h.degraded("%s is not ready: %s", v.si.Service, v.healthz)
			continue
		}
		ready++
		if cluster && v.peers < n-1 {
			h.degraded("%s has routes to %d of the other %d servers", v.si.Service, v.peers, n-1)
		}
	}

	if ready == 0 {
		h.down("no NATS server is ready: devices, pipelines and the platform's services cannot exchange messages")
	}
	if cluster {
		quorum := n/2 + 1
		if leader == "" && ready > 0 {
			h.down("JetStream has no meta leader (it needs %d of %d servers): streams cannot be created "+
				"or changed, and messages to replicated streams are not stored", quorum, n)
		} else if leader != "" {
			h.note("JetStream meta leader: %s (meta group of %d; quorum %d)", leader, n, quorum)
			for _, v := range views {
				if v.serverName != leader {
					continue
				}
				for _, p := range v.metaPeers {
					switch {
					case p.Offline:
						h.degraded("JetStream peer %s is offline", p.Name)
					case !p.Current:
						h.degraded("JetStream peer %s is not caught up with the meta leader", p.Name)
					}
				}
			}
		}
	}

	switch {
	case streamsErr != nil:
		h.degraded("the streams could not be read: %v", streamsErr)
	case ready == 0:
	default:
		var lagging, leaderless, under []string
		for _, s := range streams {
			switch {
			case s.Replicas > 1 && s.Leader == "":
				leaderless = append(leaderless, s.Name)
			case s.Peers < s.Replicas:
				under = append(under, s.Name)
			case s.Peers > 1 && !s.AllCurrent:
				lagging = append(lagging, s.Name)
			}
		}
		if len(leaderless) > 0 {
			h.down("%d stream(s) without a leader, which accept no messages: %s",
				len(leaderless), listSome(leaderless))
		}
		if len(under) > 0 {
			h.degraded("%d stream(s) with fewer copies than configured: %s", len(under), listSome(under))
		}
		if len(lagging) > 0 {
			h.degraded("%d stream(s) with a copy not caught up: %s", len(lagging), listSome(lagging))
		}
		if len(leaderless)+len(under)+len(lagging) == 0 {
			h.note("Streams: %d, every copy in sync (osi4iot streams ls)", len(streams))
		}
	}
}

func listSome(names []string) string {
	if len(names) <= 5 {
		return strings.Join(names, ", ")
	}
	return strings.Join(names[:5], ", ") + fmt.Sprintf(" and %d more", len(names)-5)
}

// ── Patroni ──────────────────────────────────────────────────────────

// patroniMaxFailoverLag is maximum_lag_on_failover in both clusters'
// patroni.yml: a replica further behind than this is not promoted.
const patroniMaxFailoverLag = 1 << 20

type patroniClusterMember struct {
	Name           string          `json:"name"`
	Role           string          `json:"role"`
	State          string          `json:"state"`
	Timeline       int64           `json:"timeline"`
	Lag            json.RawMessage `json:"lag"`
	PendingRestart bool            `json:"pending_restart"`
}

type patroniCluster struct {
	Members []patroniClusterMember `json:"members"`
	Pause   bool                   `json:"pause"`
}

func isPatroniLeader(role string) bool { return role == "leader" || role == "standby_leader" }

// lagBytes is a member's replication lag, ok=false when Patroni does not
// know it ("unknown", or absent).
func (m patroniClusterMember) lagBytes() (uint64, bool) {
	if len(m.Lag) == 0 {
		return 0, false
	}
	var n uint64
	if err := json.Unmarshal(m.Lag, &n); err != nil {
		return 0, false
	}
	return n, true
}

func checkPatroniHealth(pd *pt.PlatformData, dc *pt.DockerClient, family string, probe bool) ServiceHealth {
	h := ServiceHealth{Service: family}
	names, err := familyServices(dc, regexp.MustCompile(`^`+family+`(\d+)$`))
	if err != nil {
		h.down("%v", err)
		return h
	}
	if len(names) == 0 {
		h.down("no %s node is deployed", family)
		return h
	}
	var instances []swarmInstance
	for _, name := range names {
		instances = append(instances, inspectSwarmInstance(dc, name))
	}

	// Patroni's view of the cluster, from the first node that answers:
	// every node serves the whole cluster (it lives in the Raft DCS).
	var cluster *patroniCluster
	var askErrs []string
	for _, si := range instances {
		if !si.running() {
			continue
		}
		raw, err := si.exec("curl", "-sf", "--max-time", "10", "http://localhost:8008/cluster")
		if err != nil {
			askErrs = append(askErrs, fmt.Sprintf("%s: %v", si.Service, err))
			continue
		}
		var c patroniCluster
		if err := json.Unmarshal([]byte(raw), &c); err != nil {
			askErrs = append(askErrs, fmt.Sprintf("%s: unexpected answer: %v", si.Service, err))
			continue
		}
		cluster = &c
		break
	}

	hp := haproxyView{}
	hp.running, hp.desired, hp.err = replicatedTasks(dc, "haproxy_patroni")
	evaluatePatroni(&h, pd, instances, cluster, askErrs, hp)
	if probe {
		probePatroni(&h, family, instances, cluster)
	}
	return h
}

type haproxyView struct {
	running, desired int
	err              error
}

// evaluatePatroni turns what was read into the verdict. Pure, for tests.
func evaluatePatroni(h *ServiceHealth, pd *pt.PlatformData, instances []swarmInstance,
	cluster *patroniCluster, askErrs []string, hp haproxyView) {

	members := map[string]patroniClusterMember{}
	leader := ""
	if cluster != nil {
		for _, m := range cluster.Members {
			members[m.Name] = m
			if isPatroniLeader(m.Role) {
				leader = m.Name
			}
		}
	}
	var leaderTL int64
	if l, ok := members[leader]; ok {
		leaderTL = l.Timeline
	}

	h.Header = []string{"INSTANCE", "NODE", "TASK", "ROLE", "STATE", "TIMELINE", "LAG"}
	known := map[string]bool{}
	for _, si := range instances {
		known[si.Service] = true
		m, inCluster := members[si.Service]
		role, state, tl, lag := "-", "-", "-", "-"
		if inCluster {
			role, state = m.Role, m.State
			if m.Timeline > 0 {
				tl = strconv.FormatInt(m.Timeline, 10)
			}
			if !isPatroniLeader(m.Role) {
				if b, ok := m.lagBytes(); ok {
					lag = humanBytes(b)
				} else {
					lag = "unknown"
				}
			}
		}
		h.Rows = append(h.Rows, []string{si.Service, platformNodeName(pd, si.NodeIP), taskCell(si), role, state, tl, lag})

		if p := swarmProblem(si); p != "" {
			h.degraded("%s", p)
			continue
		}
		if cluster == nil {
			continue
		}
		if !inCluster {
			h.degraded("%s runs but is not a member of the cluster", si.Service)
			continue
		}
		if isPatroniLeader(m.Role) {
			if m.State != "running" {
				h.down("the leader %s is %q, not running: the database does not accept writes", m.Name, m.State)
			}
			if m.PendingRestart {
				h.note("%s needs a restart to apply a configuration change", m.Name)
			}
			continue
		}
		if m.State != "streaming" {
			h.degraded("%s is %q, not streaming from the leader", m.Name, m.State)
		} else if b, ok := m.lagBytes(); !ok {
			h.degraded("%s: its lag behind the leader is unknown", m.Name)
		} else if b > patroniMaxFailoverLag {
			h.degraded("%s is %s behind the leader, more than maximum_lag_on_failover (1 MiB): "+
				"it would not take over if the leader failed", m.Name, humanBytes(b))
		}
		if leaderTL > 0 && m.Timeline > 0 && m.Timeline != leaderTL {
			h.degraded("%s is on timeline %d, the leader on %d", m.Name, m.Timeline, leaderTL)
		}
		if m.PendingRestart {
			h.note("%s needs a restart to apply a configuration change", m.Name)
		}
	}

	if cluster == nil {
		msg := "no Patroni node answers on its REST API"
		if len(askErrs) > 0 {
			msg += " (" + strings.Join(askErrs, "; ") + ")"
		}
		h.down("%s", msg)
	} else {
		if leader == "" {
			h.down("the cluster has no leader: the database does not accept writes (a failover may be in progress)")
		} else {
			h.note("Leader: %s", leader)
		}
		if cluster.Pause {
			h.degraded("automatic failover is paused (patronictl pause): a failed leader would not be replaced")
		}
		for name := range members {
			if !known[name] {
				h.note("%s is listed by Patroni but has no Swarm service (a removed node not yet forgotten)", name)
			}
		}
	}

	switch {
	case hp.err != nil:
		h.degraded("haproxy_patroni could not be checked: %v", hp.err)
	case hp.running == 0:
		h.down("haproxy_patroni has no running task: the platform's services reach the database through it")
	case hp.running < hp.desired:
		h.degraded("haproxy_patroni runs %d of %d tasks", hp.running, hp.desired)
	default:
		h.note("haproxy_patroni: %d/%d tasks running", hp.running, hp.desired)
	}
}

// ── Garage ───────────────────────────────────────────────────────────

// garageLowDiskFraction: below this share of free space on a node's data
// or metadata disk, the service is reported degraded.
const garageLowDiskFraction = 0.10

type garageStatusNode struct {
	ID              string `json:"id"`
	IsUp            bool   `json:"isUp"`
	LastSeenSecsAgo *int64 `json:"lastSeenSecsAgo"`
	Draining        bool   `json:"draining"`
	Role            *struct {
		Zone string `json:"zone"`
	} `json:"role"`
	DataPartition     *garageFreeSpace `json:"dataPartition"`
	MetadataPartition *garageFreeSpace `json:"metadataPartition"`
}

type garageFreeSpace struct {
	Available uint64 `json:"available"`
	Total     uint64 `json:"total"`
}

type garageHealthFull struct {
	Status           string `json:"status"`
	StorageNodes     int    `json:"storageNodes"`
	StorageNodesUp   int    `json:"storageNodesUp"`
	Partitions       int    `json:"partitions"`
	PartitionsQuorum int    `json:"partitionsQuorum"`
	PartitionsAllOk  int    `json:"partitionsAllOk"`
}

// garageInstanceView is what was read about one instance.
type garageInstanceView struct {
	inst     pt.GarageInstance
	si       swarmInstance
	node     *garageStatusNode // nil: unknown to the cluster
	queue    uint64
	errs     uint64
	statsErr string
}

func checkGarageHealth(pd *pt.PlatformData, dc *pt.DockerClient, probe bool) ServiceHealth {
	h := ServiceHealth{Service: utils.GarageServiceName}
	if !utils.IsGarage(pd.PlatformInfo) {
		h.NotUsed = true
		h.note("This platform does not run Garage: its bucket is an external S3 bucket.")
		return h
	}
	c := newRealGarageCluster(pd, dc, log.New(io.Discard, "", 0))

	var health *garageHealthFull
	var healthErr error
	var hf garageHealthFull
	if healthErr = adminJSON(c, "GetClusterHealth", nil, 0, &hf); healthErr == nil {
		health = &hf
	}
	var status struct {
		LayoutVersion int64              `json:"layoutVersion"`
		Nodes         []garageStatusNode `json:"nodes"`
	}
	byID := map[string]*garageStatusNode{}
	if adminJSON(c, "GetClusterStatus", nil, 0, &status) == nil {
		for i := range status.Nodes {
			byID[status.Nodes[i].ID] = &status.Nodes[i]
		}
	}
	draining := false
	if health != nil {
		draining, _ = layoutDraining(c)
	}

	var views []garageInstanceView
	for _, inst := range utils.GarageInstancesSorted(pd.PlatformInfo) {
		v := garageInstanceView{inst: inst,
			si:   inspectSwarmInstance(dc, utils.GarageInstanceServiceName(inst.ID)),
			node: byID[utils.GarageNodeID(inst)]}
		if v.si.running() {
			if q, e, err := garageResyncQueue(c, inst); err != nil {
				v.statsErr = err.Error()
			} else {
				v.queue, v.errs = q, e
			}
		}
		views = append(views, v)
	}
	evaluateGarage(&h, pd, views, health, healthErr, draining, status.LayoutVersion)
	if probe {
		probeGarage(&h, pd, views)
	}
	return h
}

// evaluateGarage turns what was read into the verdict. Pure, for tests.
func evaluateGarage(h *ServiceHealth, pd *pt.PlatformData, views []garageInstanceView,
	health *garageHealthFull, healthErr error, draining bool, layoutVersion int64) {

	h.Header = []string{"INSTANCE", "NODE", "TASK", "CLUSTER", "LAYOUT", "DATA DISK FREE", "RESYNC QUEUE", "RESYNC ERRORS"}
	pending := pd.PlatformInfo.GaragePendingMove
	for _, v := range views {
		up, role, disk, queue, errs := "-", "-", "-", "-", "-"
		if v.node != nil {
			up = "down"
			if v.node.IsUp {
				up = "up"
			} else if v.node.LastSeenSecsAgo != nil {
				up = fmt.Sprintf("down (%ds)", *v.node.LastSeenSecsAgo)
			}
			switch {
			case v.node.Role != nil:
				role = "zone " + v.node.Role.Zone
			case v.node.Draining:
				role = "draining"
			default:
				role = "no role"
			}
			if d := v.node.DataPartition; d != nil && d.Total > 0 {
				disk = fmt.Sprintf("%s (%d%%)", humanBytes(d.Available), d.Available*100/d.Total)
			}
		}
		if v.si.running() && v.statsErr == "" {
			queue, errs = strconv.FormatUint(v.queue, 10), strconv.FormatUint(v.errs, 10)
		}
		h.Rows = append(h.Rows, []string{v.si.Service, platformNodeName(pd, v.inst.NodeIP), taskCell(v.si), up, role, disk, queue, errs})

		if p := swarmProblem(v.si); p != "" {
			h.degraded("%s", p)
			continue
		}
		moving := pending != nil && (pending.NewID == v.inst.ID || pending.OldID == v.inst.ID)
		switch {
		case v.node == nil && health != nil:
			h.degraded("%s runs but the cluster does not know its node", v.si.Service)
		case v.node == nil:
		case !v.node.IsUp:
			h.degraded("%s runs but the cluster sees it disconnected", v.si.Service)
		case v.node.Role == nil && !moving:
			h.degraded("%s has no role in the layout: it stores nothing", v.si.Service)
		}
		if v.node != nil {
			for _, p := range []struct {
				what string
				fs   *garageFreeSpace
			}{{"data", v.node.DataPartition}, {"metadata", v.node.MetadataPartition}} {
				if p.fs != nil && p.fs.Total > 0 && float64(p.fs.Available) < garageLowDiskFraction*float64(p.fs.Total) {
					h.degraded("%s: its %s disk is almost full (%s free of %s)", v.si.Service, p.what,
						humanBytes(p.fs.Available), humanBytes(p.fs.Total))
				}
			}
		}
		if v.statsErr != "" {
			h.degraded("%s: its block statistics could not be read: %s", v.si.Service, v.statsErr)
		} else if v.errs > 0 {
			h.degraded("%s: %d block(s) failed to resync and are retried (garage block list-errors, "+
				"inside its container)", v.si.Service, v.errs)
		}
	}

	if health == nil {
		h.down("no Garage instance answers: %v", healthErr)
		return
	}
	switch health.Status {
	case "healthy":
	case "degraded":
		h.degraded("not every storage node is connected, but every partition still has a write quorum")
	default:
		h.down("Garage is %q: %d of %d partitions have a write quorum — objects there cannot be written",
			health.Status, health.PartitionsQuorum, health.Partitions)
	}
	h.note("Layout v%d: %d/%d storage nodes up; partitions with a write quorum %d/%d, with every copy reachable %d/%d",
		layoutVersion, health.StorageNodesUp, health.StorageNodes,
		health.PartitionsQuorum, health.Partitions, health.PartitionsAllOk, health.Partitions)
	if draining {
		h.note("Data is being moved after a layout change (normal for a while after scale, rebalance or node add/remove)")
	}
	if pending != nil {
		h.degraded("a move of garage_%d to garage_%d was interrupted; resume it with 'osi4iot service rebalance garage'",
			pending.OldID, pending.NewID)
	}
	h.note("A resync queue that is not empty is normal: written and deleted blocks pass through it.")
}
