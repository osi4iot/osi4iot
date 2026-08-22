// backup_trigger is a tiny sidecar HTTP server that runs inside each
// patroni_admin/patroni_metrics container, alongside Patroni itself. It
// exposes a single endpoint that runs `wal-g backup-push` against this
// node's own local PGDATA, then prunes old backups down to a caller-
// specified retention count.
//
// This exists so system_manager can trigger a backup over HTTP (routed
// through haproxy_patroni, which always sends it to whichever node is
// currently primary) instead of connecting to Postgres itself and
// running wal-g in its "remote backup" (streaming) mode — that mode has
// a known compatibility bug against PostgreSQL 18 as of wal-g v3.0.8.
// Running backup-push locally, with direct filesystem access to PGDATA,
// is wal-g's much more mature and well-tested code path.
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
// cluster it's in) before it launches this binary.
package main

import (
	"context"
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
	if v := os.Getenv("BACKUP_TRIGGER_PORT"); v != "" {
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

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	// Optional shared-secret check. Network access to this port is
	// already restricted to haproxy_patroni's routing mesh, so this is
	// defense in depth, not the primary control — set
	// BACKUP_TRIGGER_API_TOKEN in the secret if you want it.
	apiToken := os.Getenv("BACKUP_TRIGGER_API_TOKEN")

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Synchronous by design: the caller (system_manager) needs to know
	// whether the backup actually succeeded, not just that it started —
	// unlike system_manager's own convenience /trigger/backup/* endpoint,
	// which is fire-and-forget for manual/interactive use.
	mux.HandleFunc("/trigger/backup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		if apiToken != "" && r.Header.Get("Authorization") != "Bearer "+apiToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		retain := retainCount(r)

		log.Println("[backup_trigger] starting backup-push")
		start := time.Now()
		out, err := runBackup()
		elapsed := time.Since(start).Round(time.Second)

		if err != nil {
			log.Printf("[backup_trigger] backup-push FAILED after %s: %v", elapsed, err)
			w.WriteHeader(http.StatusInternalServerError)
			w.Write(out)
			return
		}
		log.Printf("[backup_trigger] backup-push OK (%s)", elapsed)

		log.Printf("[backup_trigger] pruning old backups (retain %d full)", retain)
		deleteOut, deleteErr := runDeleteRetain(retain)
		if deleteErr != nil {
			log.Printf("[backup_trigger] retention cleanup FAILED: %v", deleteErr)
		} else {
			log.Println("[backup_trigger] retention cleanup OK")
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

	log.Printf("backup_trigger listening on :%s (data dir: %s)", port(), dataDir())
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server error: %v", err)
	}
}
