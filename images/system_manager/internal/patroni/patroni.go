// Package patroni queries the same per-node sidecar backup.Target
// triggers backups on (behind haproxy_patroni's :5002/:5102 frontends —
// see PATRONI_SIDECAR_URL_ADMIN/_METRICS in internal/backup) for two
// things: LeaderQuery (GET /leader) reports a cluster's current member
// topology — who's the leader (primary), who's a replica, and their
// replication lag; SwitchoverToNode1 (POST /switchover) moves
// leadership to node 1 and confirms it, for the platform CLI to call
// before removing a higher-numbered node during a scale-down.
//
// Both proxy Patroni's own local REST API verbatim (see
// patroni_sidecar's proxyLeader/proxySwitchover) — /leader returns
// {"members": [{"name","role","state","lag"}, ...]}, matching
// https://patroni.readthedocs.io/en/latest/rest_api.html.
//
// Like PATRONI_SIDECAR_URL_ADMIN/_METRICS, both talk to haproxy_patroni
// rather than to individual nodes: haproxy already health-checks and
// routes to whichever node is live, so system_manager doesn't need its
// own list of node candidates.
//
// Unlike backup.Target or certrenewer.Renewer, neither implements
// task.Scheduled — both are on-demand only, useful strictly over NATS.
// See cmd/system_manager's main.go: both are added to the NATS-exposed
// `tasks` slice but never to `scheduled`.
package patroni

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"system_manager/internal/task"
)

// queryTimeout bounds the request to haproxy_patroni.
const queryTimeout = 5 * time.Second

// LeaderQuery reports the current member topology (leader + replicas)
// of one Patroni cluster.
type LeaderQuery struct {
	// Name matches backup.Target.Name — "admin" or "metrics" — so the
	// two subsystems stay easy to correlate in logs/subjects.
	Name string

	// url is the haproxy_patroni base URL for this cluster — same
	// frontend backup.Target's triggerURL uses, just without the
	// "/trigger_backup" path.
	url string
}

var _ task.Task = LeaderQuery{}

// LoadPatroniUrlBase reads the admin/metrics Patroni endpoints from the
// environment, defaulting to the same haproxy_patroni host:port pair
// backup.LoadTargets defaults PATRONI_SIDECAR_URL_ADMIN/_METRICS to
// (5002/5102) — see internal/backup.
func LoadPatroniUrlBase() []LeaderQuery {
	return []LeaderQuery{
		{
			Name: "admin",
			url:  "http://haproxy_patroni:5002",
		},
		{
			Name: "metrics",
			url:  "http://haproxy_patroni:5102",
		},
	}
}

// Subject identifies this query for NATS routing and logging as
// "patroni.leader.<name>" (e.g. "patroni.leader.admin"), which natssvc
// turns into the subject "system_manager.patroni.leader.admin" —
// grouped under "patroni." alongside backup.Target's
// "patroni.trigger_backup.<name>", so every Patroni-related task lives
// under one prefix ("system_manager.patroni.>"), with "leader" vs
// "trigger_backup" as the next segment for anyone who wants to grant
// NATS permissions at that finer grain instead. See auth_callout's
// infra.go.
func (q LeaderQuery) Subject() string { return "patroni.leader." + q.Name }

// clusterResponse mirrors the relevant part of Patroni's GET /cluster
// response — see the package doc comment for why /leader returns the
// same shape.
type clusterResponse struct {
	Members []member `json:"members"`
}

type member struct {
	Name  string `json:"name"`
	Role  string `json:"role"` // "leader", "replica", "standby_leader", "sync_standby", ...
	State string `json:"state"`
	Host  string `json:"host"`
	Port  int    `json:"port"`
	// Lag is a json.RawMessage, not a number: Patroni reports it as an
	// integer (bytes) for a member with known lag, but as the literal
	// string "unknown" for one that hasn't reported yet — a plain
	// float64/int field would fail to decode the moment any member is
	// in that state. Passed straight through unchanged into
	// leaderResponse.Members, since json.RawMessage marshals as
	// whatever raw bytes it holds.
	Lag json.RawMessage `json:"lag,omitempty"`
}

func isLeader(role string) bool {
	return role == "leader" || role == "standby_leader"
}

// currentLeader returns the name of cluster's current leader, or "" if
// none is currently reported (e.g. mid-failover). Shared by LeaderQuery
// and SwitchoverToNode1.
func currentLeader(cluster clusterResponse) string {
	for _, m := range cluster.Members {
		if isLeader(m.Role) {
			return m.Name
		}
	}
	return ""
}

// leaderResponse is what Run returns (JSON-encoded) to every caller —
// NATS request-reply for the platform CLI being the main one. It wraps
// Patroni's raw member list with an explicit top-level Leader field,
// computed once here from isLeader(role), so callers — in particular
// the CLI deciding whether a node it's about to remove during a
// scale-down is the current leader — don't need their own copy of that
// role-matching logic; a plain string comparison against Leader is
// enough.
type leaderResponse struct {
	Cluster string   `json:"cluster"`         // "admin" or "metrics", matches LeaderQuery.Name
	Leader  string   `json:"leader,omitempty"` // empty if no leader right now (mid-failover)
	Members []member `json:"members"`
}

// Run queries q's Patroni cluster via haproxy_patroni and returns a
// JSON-encoded leaderResponse. Satisfies task.Task. An empty Leader
// field (rather than an error) is how a mid-failover "no leader yet"
// state is reported — callers should treat that as "don't know who the
// leader is right now", not as this query having failed. params is
// unused — a read-only lookup like this has nothing for a caller to
// parameterize.
func (q LeaderQuery) Run(ctx context.Context, params map[string]any) (string, error) {
	cluster, err := fetchCluster(ctx, q.url)
	if err != nil {
		return "", fmt.Errorf("querying %q: %w", q.Name, err)
	}

	body, err := json.Marshal(leaderResponse{
		Cluster: q.Name,
		Leader:  currentLeader(cluster),
		Members: cluster.Members,
	})
	if err != nil {
		return "", fmt.Errorf("encoding response for %q: %w", q.Name, err)
	}
	return string(body), nil
}

func fetchCluster(ctx context.Context, base string) (clusterResponse, error) {
	reqCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	url := strings.TrimRight(base, "/") + "/leader"
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return clusterResponse{}, fmt.Errorf("building request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return clusterResponse{}, fmt.Errorf("querying %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return clusterResponse{}, fmt.Errorf("%s returned %s", url, resp.Status)
	}

	var cluster clusterResponse
	if err := json.NewDecoder(resp.Body).Decode(&cluster); err != nil {
		return clusterResponse{}, fmt.Errorf("decoding response from %s: %w", url, err)
	}
	return cluster, nil
}

// ── Switchover ──────────────────────────────────────────────────────────

// switchoverRequestTimeout bounds the POST /switchover call itself —
// Patroni validates the request and kicks off the actual role change
// before responding, real work rather than a status read, so this is
// more generous than queryTimeout. It must stay comfortably under
// patroni_sidecar's own patroniSwitchoverTimeout (30s), which is what
// actually enforces this end-to-end.
const switchoverRequestTimeout = 20 * time.Second

// switchoverConfirmTimeout bounds how long Run polls /leader afterward
// waiting for the candidate to actually show up as leader.
// switchoverPollInterval is how often it re-checks. Patroni's own
// default loop_wait is 10s, so a member's role can take a few seconds
// past the switchover response to settle — this gives it real room
// without leaving a NATS caller (in practice, the platform CLI mid
// scale-down) hanging indefinitely on a switchover that silently never
// completed.
const (
	switchoverConfirmTimeout = 30 * time.Second
	switchoverPollInterval   = 2 * time.Second
)

// SwitchoverToNode1 asks Patroni to move leadership of one cluster to
// its node 1 ("patroni_admin1" / "patroni_metrics1"), waits for
// confirmation, and reports the outcome.
//
// The candidate is deliberately NOT a caller-supplied parameter: this
// platform always keeps node 1 and only ever removes higher-numbered
// nodes when scaling a Patroni cluster down (see docker.ScalePatroniFamily
// and, for the same convention applied to NATS, nats_replicas.go's
// comments on why nats1 is always kept). So "switch leadership to
// whichever node survives a scale-down" only ever means one thing in
// this system, and hardcoding it here means task.Task's Run(ctx)
// (string, error) signature — shared by every task in this service —
// never needed widening to carry a per-request parameter just for this.
// If a genuine need for an arbitrary-candidate switchover shows up
// later, that's a reason to add a second, explicitly-parameterized task
// type — not to loosen this one.
type SwitchoverToNode1 struct {
	// Name matches LeaderQuery.Name / backup.Target.Name — "admin" or
	// "metrics".
	Name string

	// url is the same haproxy_patroni base URL LeaderQuery uses.
	url string
}

var _ task.Task = SwitchoverToNode1{}

// LoadSwitchovers builds the admin/metrics switchover requests, reusing
// the exact same PATRONI_API_URL_ADMIN/_METRICS environment variables
// LoadPatroniUrlBase does — both talk to the same haproxy_patroni frontend,
// just different paths.
func LoadSwitchovers() []SwitchoverToNode1 {
	var out []SwitchoverToNode1
	for _, q := range LoadPatroniUrlBase() {
		out = append(out, SwitchoverToNode1{Name: q.Name, url: q.url})
	}
	return out
}

// Subject identifies this task for NATS routing and logging as
// "patroni.switchover.<name>" (e.g. "patroni.switchover.admin") —
// "system_manager.patroni.switchover.admin" once natssvc nests it,
// alongside "patroni.leader.<name>" and "patroni.trigger_backup.<name>"
// under the same "patroni." prefix. See auth_callout's infra.go for
// permissions.
func (s SwitchoverToNode1) Subject() string { return "patroni.switchover." + s.Name }

// candidate is this cluster's node 1 — see the SwitchoverToNode1 doc
// comment for why this is fixed rather than a parameter.
func (s SwitchoverToNode1) candidate() string { return "patroni_" + s.Name + "1" }

// switchoverResult is what Run returns (JSON-encoded) on success.
type switchoverResult struct {
	Cluster   string `json:"cluster"`
	Candidate string `json:"candidate"`
	// AlreadyLeader is true when the candidate was already the leader —
	// Run is a no-op in that case (still success, nothing to confirm).
	AlreadyLeader bool `json:"alreadyLeader,omitempty"`
}

// Run makes s's cluster's node 1 the leader, if it isn't already, and
// confirms it before returning. Satisfies task.Task. params is unused —
// see this type's doc comment for why the candidate is deliberately not
// a caller-supplied parameter in the first place.
//
// Idempotent: if node 1 is already the leader, this succeeds
// immediately without calling Patroni's /switchover at all — safe for
// the CLI to call defensively before every node removal during a
// scale-down, even when no switchover actually turns out to be needed.
func (s SwitchoverToNode1) Run(ctx context.Context, params map[string]any) (string, error) {
	candidate := s.candidate()

	cluster, err := fetchCluster(ctx, s.url)
	if err != nil {
		return "", fmt.Errorf("querying %q: %w", s.Name, err)
	}
	leader := currentLeader(cluster)

	if leader == candidate {
		body, err := json.Marshal(switchoverResult{Cluster: s.Name, Candidate: candidate, AlreadyLeader: true})
		if err != nil {
			return "", fmt.Errorf("encoding response for %q: %w", s.Name, err)
		}
		return string(body), nil
	}

	if err := postSwitchover(ctx, s.url, leader, candidate); err != nil {
		return "", fmt.Errorf("requesting switchover for %q: %w", s.Name, err)
	}

	if err := waitForLeader(ctx, s.url, candidate); err != nil {
		return "", fmt.Errorf("confirming switchover for %q: %w", s.Name, err)
	}

	body, err := json.Marshal(switchoverResult{Cluster: s.Name, Candidate: candidate})
	if err != nil {
		return "", fmt.Errorf("encoding response for %q: %w", s.Name, err)
	}
	return string(body), nil
}

// switchoverRequestBody is what gets POSTed to /switchover — see
// https://patroni.readthedocs.io/en/latest/rest_api.html#switchover-and-failover-endpoints.
// Leader is omitted when the current leader isn't known (mid-failover):
// Patroni treats a present Leader as a safety check (refuses if it no
// longer matches reality) and its absence as "switch over from whoever
// is currently leader, unverified" — still a valid request, just a
// less-guarded one.
type switchoverRequestBody struct {
	Leader    string `json:"leader,omitempty"`
	Candidate string `json:"candidate"`
}

// postSwitchover POSTs to base's (haproxy_patroni's) /switchover — which
// patroni_sidecar's proxySwitchover relays to Patroni's own local
// /switchover — and treats anything other than 200 as failure, folding
// Patroni's own error message (rewound leader mismatch, unhealthy
// candidate, etc.) into the returned error so the caller sees exactly
// why, not just that it failed.
func postSwitchover(ctx context.Context, base, leader, candidate string) error {
	reqCtx, cancel := context.WithTimeout(ctx, switchoverRequestTimeout)
	defer cancel()

	payload, err := json.Marshal(switchoverRequestBody{Leader: leader, Candidate: candidate})
	if err != nil {
		return fmt.Errorf("encoding switchover request: %w", err)
	}

	url := strings.TrimRight(base, "/") + "/switchover"
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var body bytes.Buffer
		body.ReadFrom(resp.Body)
		return fmt.Errorf("%s returned %s: %s", url, resp.Status, strings.TrimSpace(body.String()))
	}
	return nil
}

// waitForLeader polls base's /leader (via fetchCluster) every
// switchoverPollInterval, up to switchoverConfirmTimeout, until want is
// reported as the leader. A fetchCluster error on any single poll is
// logged-worthy but not fatal — haproxy briefly having no healthy
// backend mid-switchover is expected, not a reason to give up — so only
// the overall timeout, not an individual failed poll, produces an
// error.
func waitForLeader(ctx context.Context, base, want string) error {
	deadline := time.Now().Add(switchoverConfirmTimeout)
	for {
		if cluster, err := fetchCluster(ctx, base); err == nil {
			if currentLeader(cluster) == want {
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s did not become leader within %s", want, switchoverConfirmTimeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(switchoverPollInterval):
		}
	}
}

// ── Raft reset (node 1, sole-survivor case) ────────────────────────────────

// resetRaftTimeout bounds the /reset_raft call — a local filesystem
// operation on the target node (see patroni_sidecar's resetRaft), not
// expected to ever legitimately take long.
const resetRaftTimeout = 15 * time.Second

// ResetNode1Raft asks node 1 to wipe its local Raft/DCS state, for the
// case a scale-down leaves it as the sole survivor of what was a
// multi-member Patroni cluster. See patroni_sidecar's resetRaft doc
// comment for why that's needed: Raft's own reconfiguration protocol
// needs a majority of the OLD membership to accept a smaller one, which
// becomes impossible once the other members' containers are already
// gone — so the only way out is wiping the journal and letting Patroni
// bootstrap fresh as a 1-member group.
//
// Like SwitchoverToNode1, this always targets node 1 specifically, not
// a caller-supplied node — this platform's scale-down convention always
// keeps node 1 as the sole survivor of an N-to-1 scale-down, so there's
// never a genuine need to reset a DIFFERENT node's Raft state from
// here. See SwitchoverToNode1's doc comment for the fuller reasoning on
// why that's fine given task.Task's Run(ctx) (string, error) signature
// has no room for a per-request parameter.
//
// Unlike SwitchoverToNode1, this doesn't look up who the current leader
// is before acting — it relies on haproxy_patroni already routing to
// whoever's currently primary, and on node 1 being guaranteed to
// already BE primary by the time a caller invokes this: the platform
// CLI only calls ResetNode1Raft after SwitchoverToNode1 has already
// confirmed node 1 holds leadership, as the next step of the same
// scale-down. A plain POST through the same frontend lands on node 1
// without this task needing its own leader lookup first.
type ResetNode1Raft struct {
	// Name matches LeaderQuery.Name / SwitchoverToNode1.Name — "admin"
	// or "metrics".
	Name string

	// url is the same haproxy_patroni base URL LeaderQuery and
	// SwitchoverToNode1 use.
	url string
}

var _ task.Task = ResetNode1Raft{}

func LoadResetRaftNode1Queries() []LeaderQuery {
	return []LeaderQuery{
		{
			Name: "admin",
			url:  "http://patroni_admin1:8091",
		},
		{
			Name: "metrics",
			url:  "http://patroni_metrics1:8091",
		},
	}
}

// LoadRaftResets builds the admin/metrics raft-reset requests, reusing
// the exact same PATRONI_API_URL_ADMIN/_METRICS environment variables
// LoadPatroniUrlBase and LoadSwitchovers do.
func LoadRaftResets() []ResetNode1Raft {
	var out []ResetNode1Raft
	for _, q := range LoadResetRaftNode1Queries() {
		out = append(out, ResetNode1Raft{Name: q.Name, url: q.url})
	}
	return out
}

// Subject identifies this task for NATS routing and logging as
// "patroni.reset_raft.<name>" — "system_manager.patroni.reset_raft.admin"
// once natssvc nests it, alongside "patroni.leader.<name>",
// "patroni.switchover.<name>", and "patroni.trigger_backup.<name>"
// under the same "patroni." prefix. See auth_callout's infra.go for
// permissions.
func (r ResetNode1Raft) Subject() string { return "patroni.reset_raft." + r.Name }

// resetRaftResult is what Run returns (JSON-encoded) on success.
type resetRaftResult struct {
	Cluster string `json:"cluster"`
	Reset   bool   `json:"reset"`
}

// Run asks node 1 to wipe its local Raft state. Satisfies task.Task.
// params is unused — same reasoning as SwitchoverToNode1.Run.
//
// This only wipes the journal on disk — Patroni only reads it at its
// own process startup, so it takes no effect until node 1's container
// actually restarts afterward. That's the platform CLI's
// responsibility as the next step (it already restarts every surviving
// node right after this, to push the new PATRONI_NUM_NODES — see
// docker.ScalePatroniFamily), not something Run waits for or confirms
// here.
func (r ResetNode1Raft) Run(ctx context.Context, params map[string]any) (string, error) {
	reqCtx, cancel := context.WithTimeout(ctx, resetRaftTimeout)
	defer cancel()

	url := strings.TrimRight(r.url, "/") + "/reset_raft"
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, url, nil)
	if err != nil {
		return "", fmt.Errorf("building request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var body bytes.Buffer
		body.ReadFrom(resp.Body)
		return "", fmt.Errorf("%s returned %s: %s", url, resp.Status, strings.TrimSpace(body.String()))
	}

	out, err := json.Marshal(resetRaftResult{Cluster: r.Name, Reset: true})
	if err != nil {
		return "", fmt.Errorf("encoding response for %q: %w", r.Name, err)
	}
	return string(out), nil
}