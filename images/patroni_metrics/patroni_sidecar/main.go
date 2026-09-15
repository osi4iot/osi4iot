// patroni_sidecar is a tiny sidecar HTTP server that runs inside
// patroni_metrics container, alongside Patroni itself. It
// exposes seven endpoints:
//
//   - POST /trigger_backup runs `wal-g backup-push` against this node's
//     own local PGDATA, then prunes old backups down to a caller-
//     specified retention count.
//   - POST /flush_wal closes the current WAL segment and waits until it
//     is actually in the archive, so a restore cannot silently lose the
//     up-to-30-minutes archive_timeout window. See flushWAL.
//   - GET /archiver_status reports whether WAL recycling is blocked:
//     the archiver's failure count, the backlog waiting to be archived,
//     and any replication slot holding WAL back. See
//     archiverStatusQuery.
//   - GET /backup_list returns `wal-g backup-list --json --detail`
//     verbatim, so system_manager can answer "which backups exist"
//     from wal-g's own catalogue. See runBackupList below for why the
//     catalogue has to come from wal-g rather than from listing the S3
//     prefix.
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
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
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

// walgBackupListTimeout bounds a `wal-g backup-list` call. Unlike
// walgTimeout's two hours, this reads a manifest out of S3 and returns:
// if it has not answered within a minute, something is wrong rather
// than slow. Kept below system_manager's own client timeout for the
// same call so the failure surfaces here, with wal-g's stderr attached,
// instead of as a bare timeout on the caller's side.
const walgBackupListTimeout = 60 * time.Second

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

// apiToken is the optional shared secret handlers check for. Package
// level rather than a local in main() because not every handler is an
// inline closure any more: flushWAL is a named function, and a token
// that only some handlers can see is worse than no token at all.
//
// Set from main() at startup — see the comment there for what this
// does and does not protect.
var apiToken string

// requireAuth reports whether the request may proceed, writing the 401
// itself when it may not.
//
// One helper rather than the same two-line check copied into each
// handler: with the check duplicated, adding an endpoint and forgetting
// it is a silent hole, and that is exactly how /reset_raft ended up
// without one.
func requireAuth(w http.ResponseWriter, r *http.Request) bool {
	if apiToken == "" {
		return true
	}
	if r.Header.Get("Authorization") != "Bearer "+apiToken {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return false
	}
	return true
}

// walFlushTimeout bounds waiting for a switched WAL segment to reach
// the archive. Generous because the segment is 16 MB and the archive
// may be a remote bucket, but bounded: a restore must not hang here
// when archive_command is broken, it must be told so.
const walFlushTimeout = 120 * time.Second

// psqlFields runs a single-row query and returns its columns.
//
// Uses psql rather than a driver because this binary is deliberately
// pure stdlib (see the Dockerfile's sidecar builder), and psql is in
// the image anyway. The PG* environment variables entrypoint.sh exports
// when launching this process are picked up automatically, so no
// connection details appear here.
func psqlFields(ctx context.Context, query string) ([]string, error) {
	cmd := exec.CommandContext(ctx, "psql", "-qtAX", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", query)
	cmd.Env = os.Environ()

	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errb.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf("%s", msg)
	}
	return strings.Split(strings.TrimSpace(out.String()), "|"), nil
}

// flushWAL closes the current WAL segment and waits until the archiver
// has actually pushed it.
//
// It exists because of archive_timeout: 1800s. PostgreSQL only archives
// a segment once it is full or that timer fires, so at any given moment
// up to thirty minutes of committed transactions exist only in the
// local pg_wal — not in the archive a restore reads from. Wiping PGDATA
// without this loses them, silently, and the loss is invisible
// afterwards because the restore itself succeeds.
//
// Waiting for the push, rather than just switching, is the point. It
// also turns a broken archive_command into a loud failure BEFORE the
// caller destroys anything: if archiving has been failing for hours,
// the newest usable recovery point is hours old, and that is something
// to learn now rather than after the volumes are gone.
func flushWAL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	if !requireAuth(w, r) {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), walFlushTimeout)
	defer cancel()

	// archive_mode off means nothing is ever pushed, so there is no
	// point switching and no point restoring either. Check first: the
	// alternative is polling for two minutes for something that will
	// never arrive.
	if mode, err := psqlFields(ctx, "SHOW archive_mode"); err != nil {
		http.Error(w, "querying archive_mode: "+err.Error(), http.StatusInternalServerError)
		return
	} else if len(mode) == 0 || (mode[0] != "on" && mode[0] != "always") {
		http.Error(w, "archive_mode is "+strings.Join(mode, "")+
			", so WAL is never archived and no restore point exists", http.StatusPreconditionFailed)
		return
	}

	before, err := readArchiver(ctx)
	if err != nil {
		http.Error(w, "reading pg_stat_archiver: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// pg_switch_wal() returns the END of the segment it just closed, and
	// an LSN exactly on a boundary maps to the NEXT file — hence the -1,
	// which is the documented idiom for "name the file I just closed".
	//
	// On a replica this fails with "recovery is in progress"; that error
	// reaches the caller verbatim, which is the right outcome, since
	// haproxy is supposed to have routed this to the primary.
	segFields, err := psqlFields(ctx, "SELECT pg_walfile_name(pg_switch_wal() - 1)")
	if err != nil {
		http.Error(w, "switching WAL: "+err.Error(), http.StatusInternalServerError)
		return
	}
	segment := segFields[0]
	log.Printf("[patroni_sidecar] flush_wal: closed segment %s, waiting for the archiver", segment)

	deadline := time.Now().Add(walFlushTimeout - 10*time.Second)
	for {
		now, err := readArchiver(ctx)
		if err != nil {
			http.Error(w, "reading pg_stat_archiver: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// A new failure since the baseline means archive_command is
		// broken right now. Report it instead of waiting out the
		// timeout on something that is not going to succeed.
		if now.failedCount > before.failedCount {
			log.Printf("[patroni_sidecar] flush_wal: archiver FAILING on %s", now.lastFailedWAL)
			http.Error(w, "archive_command is failing (last failure: "+now.lastFailedWAL+
				"). The archive is not receiving WAL, so recent transactions are not recoverable.",
				http.StatusInternalServerError)
			return
		}

		// WAL file names are fixed-width hex within a timeline, so a
		// plain string comparison is chronological.
		if now.lastArchivedWAL >= segment && now.lastArchivedWAL != "" {
			log.Printf("[patroni_sidecar] flush_wal: OK, archive is at %s", now.lastArchivedWAL)
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("archived up to " + now.lastArchivedWAL + " (switched at " + segment + ")"))
			return
		}

		if time.Now().After(deadline) {
			http.Error(w, "timed out waiting for "+segment+" to be archived (archive is at "+
				now.lastArchivedWAL+")", http.StatusGatewayTimeout)
			return
		}
		time.Sleep(time.Second)
	}
}

// archiverState is the subset of pg_stat_archiver flushWAL watches.
type archiverState struct {
	lastArchivedWAL string
	failedCount     int64
	lastFailedWAL   string
}

func readArchiver(ctx context.Context) (archiverState, error) {
	fields, err := psqlFields(ctx,
		"SELECT coalesce(last_archived_wal,''), failed_count, coalesce(last_failed_wal,'') FROM pg_stat_archiver")
	if err != nil {
		return archiverState{}, err
	}
	if len(fields) < 3 {
		return archiverState{}, fmt.Errorf("unexpected pg_stat_archiver output: %v", fields)
	}
	failed, _ := strconv.ParseInt(fields[1], 10, 64)
	return archiverState{
		lastArchivedWAL: fields[0],
		failedCount:     failed,
		lastFailedWAL:   fields[2],
	}, nil
}

// archiverStatusQuery reports everything needed to tell whether WAL
// recycling is blocked, as a single JSON object.
//
// Built with row_to_json so this file does no interpreting: the column
// names ARE the field names, and adding a measure later means touching
// only this string. Same reasoning as /backup_list handing wal-g's own
// output straight through.
//
// What each part answers:
//
//   - failed_count / last_failed_wal: is archive_command failing right
//     now. This is the early warning — it moves the moment archiving
//     breaks, hours or days before anything runs out of disk.
//   - seconds_since_last_archive: catches an archiver that is not
//     erroring but is not progressing either.
//   - wal_bytes / wal_files: how much is piling up. PostgreSQL cannot
//     recycle a segment until it has been archived, so this is what
//     grows when the above goes wrong.
//   - ready_files: segments finished and waiting to be archived. The
//     backlog itself, and the clearest single number.
//   - inactive_slots / slot_retained_bytes: the OTHER reason recycling
//     stalls — a replication slot whose consumer is gone holds WAL just
//     as effectively as a broken archiver, and needs a completely
//     different fix.
const archiverStatusQuery = `SELECT row_to_json(t) FROM (
  SELECT
    (SELECT setting FROM pg_settings WHERE name = 'archive_mode')          AS archive_mode,
    a.failed_count                                                         AS failed_count,
    coalesce(a.last_failed_wal, '')                                        AS last_failed_wal,
    coalesce(a.last_archived_wal, '')                                      AS last_archived_wal,
    coalesce(extract(epoch FROM now() - a.last_archived_time)::bigint, -1) AS seconds_since_last_archive,
    (SELECT count(*)::bigint FROM pg_ls_waldir())                          AS wal_files,
    (SELECT coalesce(sum(size), 0)::bigint FROM pg_ls_waldir())            AS wal_bytes,
    (SELECT count(*)::bigint FROM pg_ls_dir('pg_wal/archive_status')
       WHERE pg_ls_dir LIKE '%.ready')                                     AS ready_files,
    (SELECT count(*)::bigint FROM pg_replication_slots WHERE NOT active)   AS inactive_slots,
    (SELECT coalesce(max(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)), 0)::bigint
       FROM pg_replication_slots)                                          AS slot_retained_bytes
  FROM pg_stat_archiver a
) t`

// runBackupList asks wal-g for its own backup catalogue as JSON.
//
// wal-g's catalogue is the only authority on which stored objects add
// up to a restorable backup: a base backup is a directory of segments
// plus a manifest, deltas reference a parent, and the WAL needed to
// make any of it consistent lives elsewhere again. Listing the S3
// prefix would report objects, not backups.
//
// Unlike runBackup and runDeleteRetain, this deliberately does NOT use
// CombinedOutput. wal-g writes its progress and warnings to stderr, and
// folding those into stdout would corrupt the JSON — the two other
// functions can merge the streams because their output is only ever
// read by a human. Here stderr is captured separately and used only to
// explain a failure.
func runBackupList() (stdout []byte, stderr []byte, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), walgBackupListTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "wal-g", "backup-list", "--json", "--detail")
	cmd.Env = os.Environ()

	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf
	err = cmd.Run()
	return outBuf.Bytes(), errBuf.Bytes(), err
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
	apiToken = os.Getenv("PATRONI_SIDECAR_API_TOKEN")

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("/leader", proxyLeader)
	mux.HandleFunc("/switchover", proxySwitchover)
	mux.HandleFunc("/reset_raft", resetRaft)
	mux.HandleFunc("/flush_wal", flushWAL)

	// Read-only view of whether WAL recycling is blocked — see
	// archiverStatusQuery. Polled by vector's system_metrics collector,
	// which reaches it through haproxy and therefore always lands on
	// the primary, the only node where pg_current_wal_lsn() works.
	mux.HandleFunc("/archiver_status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET only", http.StatusMethodNotAllowed)
			return
		}
		if !requireAuth(w, r) {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), patroniAPITimeout)
		defer cancel()

		fields, err := psqlFields(ctx, archiverStatusQuery)
		if err != nil {
			http.Error(w, "querying archiver status: "+err.Error(), http.StatusInternalServerError)
			return
		}
		// row_to_json yields a single column; psqlFields splits on "|",
		// which JSON never contains outside strings we do not emit.
		body := strings.TrimSpace(strings.Join(fields, "|"))
		if body == "" {
			http.Error(w, "no archiver status returned", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(body))
	})

	// Read-only: hands wal-g's catalogue straight back to the caller,
	// which normalizes it (see system_manager's
	// internal/patroni_backup/list.go). Nothing is interpreted here, for
	// the same reason proxyLeader interprets nothing: it keeps this
	// binary from having to know which wal-g version is installed.
	mux.HandleFunc("/backup_list", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET only", http.StatusMethodNotAllowed)
			return
		}
		if !requireAuth(w, r) {
			return
		}

		out, errOut, err := runBackupList()
		if err != nil {
			// wal-g's stderr is the only thing that explains why —
			// missing credentials, a prefix that does not exist,
			// permissions — so it goes back whole rather than as a
			// generic message. text/plain, because it is not JSON and
			// claiming otherwise would send the caller into a parse
			// error instead of showing them the reason.
			log.Printf("[patroni_sidecar] backup-list FAILED: %v", err)
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusInternalServerError)
			w.Write(errOut)
			return
		}

		// An empty catalogue is a valid answer, and wal-g reports it as
		// literal "null" rather than "[]".
		body := bytes.TrimSpace(out)
		if len(body) == 0 || string(body) == "null" {
			body = []byte("[]")
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		w.WriteHeader(http.StatusOK)
		w.Write(body)
	})

	// Synchronous by design: the caller (system_manager) needs to know
	// whether the backup actually succeeded, not just that it started —
	// unlike system_manager's own convenience /trigger_backup/* endpoint,
	// which is fire-and-forget for manual/interactive use.
	mux.HandleFunc("/trigger_backup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		if !requireAuth(w, r) {
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