// patroni_sidecar is a tiny sidecar HTTP server that runs inside
// patroni_admin container, alongside Patroni itself. It
// exposes four endpoints:
//
//   - POST /trigger_backup runs `wal-g backup-push` against this node's
//     own local PGDATA, then prunes old backups down to a caller-
//     specified retention count.
//   - GET /leader proxies Patroni's own local REST API
//     (http://localhost:8008/cluster) verbatim, so callers reach it the
//     same way they reach /trigger_backup — through haproxy_patroni —
//     without Patroni's REST API port needing to be exposed itself. See
//     proxyLeader below.
//   - POST /switchover proxies Patroni's own local
//     (http://localhost:8008/switchover) verbatim, same reasoning as
//     /leader. See proxySwitchover below.
//   - POST /reset_raft wipes this node's local Raft/DCS state on disk —
//     unlike the three above, this is NOT a Patroni REST API proxy;
//     Patroni has no equivalent endpoint. See resetRaft below.
//
// /trigger_backup exists so system_manager can trigger a backup over
// HTTP (routed through haproxy_patroni, which always sends it to
// whichever node is currently primary) instead of connecting to
// Postgres itself and running wal-g in its "remote backup" (streaming)
// mode — that mode has a known compatibility bug against PostgreSQL 18
// as of wal-g v3.0.8. Running backup-push locally, with direct
// filesystem access to PGDATA, is wal-g's much more mature and
// well-tested code path.
//
// Retention cleanup (wal-g delete retain) runs here too, right after a
// successful backup-push — it's a pure S3-metadata operation against
// backups already uploaded from this same node, so it needs no
// credentials beyond what backup-push itself already has. The retain
// COUNT itself is not configured here — system_manager is the single
// source of truth for that policy and passes it on each call via the
// ?retain= query parameter, so it doesn't need duplicating in two
// places.
//
// This binary is deliberately generic: it does not know or care whether
// it is running in the admin or metrics cluster. All the PG*/WALG_*/AWS_*
// environment variables wal-g needs are expected to already be set on
// this process's environment by entrypoint.sh (which does know which
// cluster it's in) before it launches this binary. /leader needs no
// such environment — Patroni's REST API is always on localhost:8008
// regardless of cluster.
package main

import (
	"context"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

// walgTimeout bounds how long a single wal-g invocation (backup-push or
// delete retain) may run. Intentionally generous and independent of the
// triggering HTTP request's lifetime (see the handler below): if the
// caller's connection drops partway through, the operation keeps
// running to completion rather than being killed mid-way, which could
// otherwise leave Postgres stuck in backup mode (pg_backup_start
// without a matching pg_backup_stop).
const walgTimeout = 2 * time.Hour

// patroniAPITimeout bounds local proxy calls to Patroni's own REST API
// for /leader. Unlike walgTimeout, this has no reason to be generous —
// it's a same-container, localhost-only HTTP call to a process that's
// either up and answering in milliseconds, or down.
const patroniAPITimeout = 5 * time.Second

// patroniSwitchoverTimeout bounds the proxy call to Patroni's own
// /switchover. Longer than patroniAPITimeout: unlike a plain GET,
// Patroni validates the request (checks the specified leader still
// matches, the candidate is healthy and caught up) and kicks off the
// actual role change before responding — real work, not just a status
// read. It does NOT wait for confirmation that the candidate has fully
// taken over; that's polled separately via repeated /leader calls by
// the caller (system_manager), each bounded by its own short timeout.
const patroniSwitchoverTimeout = 30 * time.Second

// patroniClusterURL and patroniSwitchoverURL are Patroni's own REST API
// endpoints, always local to this container regardless of which
// cluster (admin/metrics) it's part of.
const (
	patroniClusterURL    = "http://localhost:8008/cluster"
	patroniSwitchoverURL = "http://localhost:8008/switchover"
)

// defaultRetain is used only if the caller omits ?retain= entirely —
// system_manager always sends it explicitly; this is a safety net for
// manual/curl testing.
const defaultRetain = 7

func dataDir() string {
	if v := os.Getenv("PATRONI_DATA_DIR"); v != "" {
		return v
	}
	return "/data/patroni"
}

func port() string {
	if v := os.Getenv("PATRONI_SIDECAR_PORT"); v != "" {
		return v
	}
	return "8091"
}

func retainCount(r *http.Request) int {
	v := r.URL.Query().Get("retain")
	if v == "" {
		return defaultRetain
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return defaultRetain
	}
	return n
}

func runBackup() ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), walgTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "wal-g", "backup-push", dataDir())
	cmd.Env = os.Environ()
	return cmd.CombinedOutput()
}

func runDeleteRetain(retain int) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), walgTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "wal-g", "delete", "retain", "FULL", strconv.Itoa(retain), "--confirm")
	cmd.Env = os.Environ()
	return cmd.CombinedOutput()
}

// proxyLeader relays Patroni's own local GET /cluster verbatim — same
// status code, same body, same Content-Type — so callers on the other
// side of haproxy_patroni see exactly what Patroni itself would report,
// without this process reshaping or reinterpreting it. See the package
// doc comment for why this exists as a proxy rather than a client
// hitting Patroni's REST API directly.
func proxyLeader(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET only", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), patroniAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, patroniClusterURL, nil)
	if err != nil {
		http.Error(w, "building request to Patroni: "+err.Error(), http.StatusInternalServerError)
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		// Patroni not up / not answering — 502, not 500: this
		// process is fine, the thing it's fronting isn't.
		http.Error(w, "querying local Patroni API: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// proxySwitchover relays Patroni's own local POST /switchover verbatim
// — request body in, response status/body out, unchanged — the same
// pure-proxy shape as proxyLeader, and for the same reason: this
// process doesn't interpret or validate the switchover request (which
// current leader, which candidate) any more than it interprets backup
// parameters; it just gets the caller (system_manager, over NATS, on
// behalf of the platform CLI) to Patroni's local API without exposing
// Patroni's REST port itself. See
// https://patroni.readthedocs.io/en/latest/rest_api.html#switchover-and-failover-endpoints
// for the expected {"leader": "...", "candidate": "..."} body shape —
// this process never inspects it.
func proxySwitchover(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), patroniSwitchoverTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, patroniSwitchoverURL, r.Body)
	if err != nil {
		http.Error(w, "building request to Patroni: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Propagate the real Content-Length so this goes out as a normal
	// framed request instead of chunked transfer-encoding — Patroni's
	// REST API is a Python http.server-based implementation, which (like
	// the fake one used to test this) reads request bodies by
	// Content-Length and does not decode chunked encoding, so an
	// unset/zero ContentLength here would silently deliver an empty
	// body to Patroni regardless of what the actual caller sent.
	req.ContentLength = r.ContentLength
	if ct := r.Header.Get("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	} else {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		// Same reasoning as proxyLeader: 502, not 500 — this process
		// is fine, Patroni isn't answering.
		http.Error(w, "querying local Patroni API: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// patroniRaftDataDir is where Patroni's embedded-Raft DCS keeps its
// on-disk journal — must match raft.data_dir in patroni.yml.
const patroniRaftDataDir = "/data/raft"

// resetRaft wipes this node's local Raft/DCS state on disk, so the next
// time its Patroni process starts, it bootstraps a fresh Raft group
// instead of trying to resume one whose membership no longer matches
// reality.
//
// This exists for the case a scale-down leaves exactly one surviving
// node: Raft's own reconfiguration protocol needs a majority of the OLD
// membership to accept "we're down to 1 member" — which becomes
// mathematically impossible once the other members' containers are
// gone, since their votes can never be obtained again. Patroni's Raft
// thread then fails permanently trying to reach a quorum that can no
// longer exist. Wiping the journal and letting Patroni bootstrap fresh
// as a 1-member Raft group is the only way out once that's happened —
// this replaces exactly the manual recovery already confirmed to work:
// `rm -rf /data/raft && mkdir -p /data/raft`.
//
// Deliberately as dumb/mechanical as proxyLeader and proxySwitchover:
// it does NOT check whether resetting is actually safe right now (e.g.
// whether this node genuinely is meant to be the sole survivor) — that
// decision belongs entirely to the caller (system_manager's
// ResetNode1Raft, on behalf of the platform CLI's scale-down logic),
// which is the only place that knows the target cluster size. Calling
// this on a node that's still meant to have peers makes it forget them
// — don't.
//
// No chown: this whole container runs as the postgres user from the
// Dockerfile's USER directive onward (see entrypoint.sh), so
// os.MkdirAll here creates the fresh directory already owned by
// postgres. The manual recovery this replaces needed a chown
// specifically because it used `docker exec -u root`, which creates
// files as root instead — that extra step doesn't apply here.
//
// Only wipes the journal on disk — does NOT restart Patroni itself.
// Patroni reads this only at its own process startup, not while
// running, so the caller still needs the container to actually restart
// afterward for this to take effect. ScalePatroniFamily's scale-down
// branch handles that by calling this BEFORE refreshPatroniNodesEnv,
// which restarts every surviving node (node 1, in the N-to-1 case) to
// push the new PATRONI_NUM_NODES anyway — no separate forced-restart
// step needed.
func resetRaft(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}

	if err := os.RemoveAll(patroniRaftDataDir); err != nil {
		http.Error(w, "removing "+patroniRaftDataDir+": "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := os.MkdirAll(patroniRaftDataDir, 0o700); err != nil {
		http.Error(w, "recreating "+patroniRaftDataDir+": "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("raft state reset: " + patroniRaftDataDir))
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	// Optional shared-secret check. Network access to this port is
	// already restricted to haproxy_patroni's routing mesh, so this is
	// defense in depth, not the primary control — set
	// PATRONI_SIDECAR_API_TOKEN in the secret if you want it.
	apiToken := os.Getenv("PATRONI_SIDECAR_API_TOKEN")

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("/leader", proxyLeader)
	mux.HandleFunc("/switchover", proxySwitchover)
	mux.HandleFunc("/reset_raft", resetRaft)

	// Synchronous by design: the caller (system_manager) needs to know
	// whether the backup actually succeeded, not just that it started —
	// unlike system_manager's own convenience /trigger_backup/* endpoint,
	// which is fire-and-forget for manual/interactive use.
	mux.HandleFunc("/trigger_backup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		if apiToken != "" && r.Header.Get("Authorization") != "Bearer "+apiToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		retain := retainCount(r)

		log.Println("[patroni_sidecar] starting backup-push")
		start := time.Now()
		out, err := runBackup()
		elapsed := time.Since(start).Round(time.Second)

		if err != nil {
			log.Printf("[patroni_sidecar] backup-push FAILED after %s: %v", elapsed, err)
			w.WriteHeader(http.StatusInternalServerError)
			w.Write(out)
			return
		}
		log.Printf("[patroni_sidecar] backup-push OK (%s)", elapsed)

		log.Printf("[patroni_sidecar] pruning old backups (retain %d full)", retain)
		deleteOut, deleteErr := runDeleteRetain(retain)
		if deleteErr != nil {
			log.Printf("[patroni_sidecar] retention cleanup FAILED: %v", deleteErr)
		} else {
			log.Println("[patroni_sidecar] retention cleanup OK")
		}

		// Success is defined by backup-push alone — a retention hiccup
		// means there's cleanup to look into, but the backup itself did
		// happen, which is the thing that actually matters to the caller.
		w.WriteHeader(http.StatusOK)
		w.Write(out)
		w.Write([]byte("\n--- retention cleanup ---\n"))
		w.Write(deleteOut)
	})

	srv := &http.Server{Addr: ":" + port(), Handler: mux}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	log.Printf("patroni_sidecar listening on :%s (data dir: %s)", port(), dataDir())
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server error: %v", err)
	}
}