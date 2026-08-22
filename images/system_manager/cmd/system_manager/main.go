// system_manager runs maintenance jobs for the osi4iot platform —
// periodic WAL-G backups for the patroni-admin and patroni-metrics
// clusters (internal/backup) and Let's Encrypt certificate renewal via
// ACME/Route53 with Docker secret rotation (internal/certrenewer,
// internal/dockersvc) — and exposes every one of them as an on-demand
// NATS request-reply endpoint too (internal/natssvc), so "runs on its
// own schedule" and "triggered manually" are the exact same code path
// for every task (see internal/task).
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"system_manager/internal/backup"
	"system_manager/internal/certrenewer"
	"system_manager/internal/config"
	"system_manager/internal/natssvc"
	"system_manager/internal/prune"
	"system_manager/internal/schedule"
	"system_manager/internal/task"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	// Every task this process knows about, wrapped with
	// task.Serialize/task.SerializeScheduled so its own periodic
	// schedule and an on-demand NATS trigger can never run it twice at
	// once (see internal/task). tasks holds all of them — every task is
	// reachable over NATS regardless of whether it also has a schedule
	// of its own — while scheduled holds just the subset that runs
	// automatically.
	var tasks []task.Task
	var scheduled []task.Scheduled

	if os.Getenv("USE_PATRONI_TOOL") == "true" {
		for _, t := range backup.LoadTargets() {
			st := task.SerializeScheduled(t)
			scheduled = append(scheduled, st)
			tasks = append(tasks, st)
		}
	}

	// Cert renewal only applies to the Let's Encrypt/Route53 path — see
	// internal/certrenewer. Gate it explicitly so a "certs provided by
	// an external CA" deployment doesn't spin up a task that
	// config.MustEnv()-panics on missing Route53 vars it was never
	// given.
	if os.Getenv("CERT_RENEWAL_ENABLED") == "true" {
		certHour := config.EnvIntDefault("SYSTEM_MANAGER_CERT_CHECK_HOUR", 2)
		renewer := task.SerializeScheduled(certrenewer.New(certrenewer.LoadConfig(), certHour))
		scheduled = append(scheduled, renewer)
		tasks = append(tasks, renewer)
	}

	// Cluster-wide `docker system prune`, via a Swarm global-job — see
	// internal/prune. Needs the same Docker access as cert renewal
	// (node.role==manager placement + /var/run/docker.sock bind mount),
	// gated the same way: don't build a Pruner on a deployment that
	// didn't grant it that access.
	pruner := task.SerializeScheduled(prune.New(prune.LoadConfig()))
	scheduled = append(scheduled, pruner)
	tasks = append(tasks, pruner)

	// Add future tasks the same way: build them, wrap with
	// task.Serialize (or task.SerializeScheduled if they also run on
	// their own timer), append to tasks (and scheduled, if applicable).
	// Nothing else in this file needs to change.

	for _, t := range scheduled {
		go schedule.Loop(ctx, t)
	}

	// The NATS connection needs NATS_NKEY_SEED/DOMAIN_NAME regardless of
	// which tasks are enabled (entrypoint.sh always requires them), so
	// it starts whenever there's at least one task to expose — not only
	// when backups are — rather than being gated on USE_PATRONI_TOOL
	// the way it used to be.
	if len(tasks) > 0 {
		go func() {
			if err := natssvc.Run(ctx, natssvc.LoadConfig(), tasks); err != nil {
				log.Fatalf("nats service error: %v", err)
			}
		}()
	}

	// Kept for Docker's own HEALTHCHECK — the actual trigger API lives on
	// NATS now, this is deliberately just a liveness probe.
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	srv := &http.Server{Addr: ":8090", Handler: mux}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	log.Println("system_manager listening on :8090 (health only — triggers are via NATS)")
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server error: %v", err)
	}
}
