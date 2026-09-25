// system_manager runs maintenance jobs for the osi4iot platform —
// periodic WAL-G backups for the patroni_admin and patroni_metrics
// clusters (internal/patroni_backup), periodic S3 backups of NATS
// JetStream streams (internal/nats_backup), and Let's Encrypt
// certificate renewal via ACME/Route53 with Docker secret rotation
// (internal/certrenewer, internal/dockersvc) — and exposes every one of
// them as an on-demand NATS request-reply endpoint too
// (internal/natssvc), so "runs on its own schedule" and "triggered
// manually" are the exact same code path for every task (see
// internal/task). Every NATS connection in this process, whether for
// natssvc's own request-reply service or nats_backup's JetStream calls,
// goes through the single shared identity in internal/natsconn. Every
// task Run, on either trigger path, is gated through the single shared
// internal/taskpool.Pool built in main, so a burst of simultaneously-due
// tasks — several defaults now cluster near 00:00 UTC on purpose — never
// runs unbounded.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"system_manager/internal/certrenewer"
	"system_manager/internal/certstore"
	"system_manager/internal/config"
	"system_manager/internal/nats_backup"
	"system_manager/internal/natssvc"
	"system_manager/internal/patroni"
	"system_manager/internal/patroni_backup"
	"system_manager/internal/prune"
	"system_manager/internal/schedule"
	"system_manager/internal/statefile"
	"system_manager/internal/task"
	"system_manager/internal/taskpool"
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
		for _, t := range patroni_backup.LoadTargets() {
			st := task.SerializeScheduled(t)
			scheduled = append(scheduled, st)
			tasks = append(tasks, st)
		}

		// "What backups exist" is a read-only question about wal-g's
		// catalogue, so it goes to tasks and never to scheduled — same
		// reasoning as patroni.LeaderQuery below. See
		// internal/patroni_backup/list.go for why this asks wal-g
		// instead of listing S3 like the other backup targets do.
		for _, l := range patroni_backup.LoadBackupLists() {
			tasks = append(tasks, task.Serialize(l))
		}

		// Forcing a WAL switch and waiting for the archive to receive
		// it — what the CLI's patroni restore does before destroying
		// anything, so the up-to-archive_timeout window of committed
		// transactions still only in pg_wal is not lost. On-demand
		// only: on a timer it would defeat archive_timeout.
		for _, f := range patroni_backup.LoadFlushWALs() {
			tasks = append(tasks, task.Serialize(f))
		}

		// "Who's the leader right now" is a read-only lookup, not
		// something that needs its own timer — task.Serialize (not
		// SerializeScheduled) and appended only to tasks, never to
		// scheduled, so it's reachable over NATS on demand and never
		// runs on its own. See internal/patroni.
		for _, q := range patroni.LoadPatroniUrlBase() {
			tasks = append(tasks, task.Serialize(q))
		}

		// Moving leadership to node 1 before the platform CLI removes a
		// higher-numbered node during a scale-down — also on-demand
		// only, same reasoning as LeaderQuery above. task.Serialize
		// additionally protects against two overlapping scale-downs
		// (or a retried NATS request) triggering a switchover twice at
		// once. See internal/patroni.
		for _, s := range patroni.LoadSwitchovers() {
			tasks = append(tasks, task.Serialize(s))
		}

		// Wiping node 1's local Raft state for the sole-survivor case
		// of a scale-down — same on-demand-only reasoning as the two
		// above. See internal/patroni's ResetNode1Raft.
		for _, r := range patroni.LoadRaftResets() {
			tasks = append(tasks, task.Serialize(r))
		}
	}

	// Periodic S3 backup of every NATS JetStream stream, plus its
	// on-demand-only restore counterpart — see internal/nats_backup. It
	// connects to NATS with the same shared identity natssvc uses (see
	// internal/natsconn), so no NKey of its own to provision — but still
	// needs its S3 prefix (NATS_BACKUP_S3_PREFIX), so a deployment that
	// hasn't provisioned that yet shouldn't get a task that
	// config.MustEnv()-panics on it at startup.
	if os.Getenv("NATS_BACKUP_ENABLED") == "true" {
		nbCfg := nats_backup.LoadConfig()

		nb := task.SerializeScheduled(nats_backup.NewBackup(nbCfg))
		scheduled = append(scheduled, nb)
		tasks = append(tasks, nb)

		// Restore is on-demand only (always restores the latest run —
		// see internal/nats_backup's package doc comment for why), so it
		// goes to tasks but never scheduled, same reasoning as
		// patroni.LeaderQuery/SwitchoverToNode1/ResetNode1Raft above.
		// task.Serialize (not SerializeScheduled) still guards against
		// two overlapping restore requests racing each other.
		tasks = append(tasks, task.Serialize(nats_backup.NewRestore(nbCfg)))

		// Listing is what makes Restore's "always the latest run"
		// default safe to live with: without it the operator cannot see
		// whether that run predates whatever they are recovering from.
		// Read-only and on-demand, so tasks only.
		tasks = append(tasks, task.Serialize(nats_backup.NewList(nbCfg)))
	}

	// Cert renewal only applies to the Let's Encrypt/Route53 path — see
	// internal/certrenewer. Gate it explicitly so a "certs provided by
	// an external CA" deployment doesn't spin up a task that
	// config.MustEnv()-panics on missing Route53 vars it was never
	// given.
	if os.Getenv("CERT_RENEWAL_ENABLED") == "true" {
		certCfg := certrenewer.LoadConfig()

		// One certstore for both cert tasks, built here so a bad
		// PLATFORM_ENCRYPTION_KEY is a startup failure rather than a
		// surprise at 00:00 UTC — the certificate material on the
		// volume is unreadable without it, and re-obtaining instead
		// would quietly burn Let's Encrypt's duplicate-cert rate limit.
		certStore, err := certrenewer.NewStore(certCfg)
		if err != nil {
			log.Fatalf("cert store: %v", err)
		}

		// One-time move of a pre-encryption domain_certs.json onto the
		// encrypted domain_certs.enc. No-op on a fresh volume and on
		// every subsequent start.
		if migrated, err := certStore.MigrateLegacyPlaintext(); err != nil {
			log.Fatalf("cert store: migrating legacy plaintext state: %v", err)
		} else if migrated {
			log.Println("[certs] migrated plaintext domain_certs.json to encrypted domain_certs.enc")
		}

		// Populate the volume from the certificates the CLI issued at
		// platform creation, so the very first expiry check has
		// something real to check instead of an empty volume. Only
		// writes when the seed is newer than what's stored — see
		// certstore.Store.Seed.
		if msg, err := certStore.Seed(certstore.SeedFile); err != nil {
			log.Fatalf("cert store: seeding from the CLI secret: %v", err)
		} else {
			log.Printf("[certs] %s", msg)
		}

		certHour := config.EnvIntDefault("SYSTEM_MANAGER_CERT_CHECK_HOUR", 0)
		certEveryHours := config.EnvIntDefault("SYSTEM_MANAGER_CERT_CHECK_EVERY_HOURS", 24)
		certRenewer := certrenewer.New(certCfg, certStore, certHour, certEveryHours)

		// The CLI deploys from its own state file, which goes stale as
		// soon as this service renews on its own. Converge the running
		// services onto whatever is actually stored, shortly after boot
		// — otherwise a platform restarted after a long stop serves the
		// CLI's old certificate until the next scheduled check, up to a
		// day later. See certrenewer.ReconcileAtStartup.
		go certrenewer.ReconcileAtStartup(ctx, certRenewer)

		renewer := task.SerializeScheduled(certRenewer)
		scheduled = append(scheduled, renewer)
		tasks = append(tasks, renewer)

		// Handing the stored certificates back to the CLI is a
		// read-only lookup, on-demand only — same reasoning as
		// patroni.LeaderQuery: appended to tasks, never to scheduled.
		tasks = append(tasks, task.Serialize(certrenewer.NewExporter(certStore)))
	}

	// Encrypted off-host copies of the platform CLI's
	// osi4iot_state.json — see internal/statefile. All three tasks are
	// on-demand only: this service has no state file of its own, so
	// there is nothing for a timer to act on. The CLI triggers a backup
	// after every change it makes to the file.
	//
	// Gated on STATE_FILE_S3_PREFIX the same way nats_backup is gated on
	// its own prefix: a deployment that hasn't provisioned one shouldn't
	// get tasks that config.MustEnv()-panic at startup.
	if os.Getenv("STATE_FILE_S3_PREFIX") != "" {
		sfCfg := statefile.LoadConfig()
		tasks = append(tasks,
			task.Serialize(statefile.NewBackup(sfCfg)),
			task.Serialize(statefile.NewRestore(sfCfg)),
			task.Serialize(statefile.NewList(sfCfg)),
		)
	}

	// Cluster-wide `docker system prune`, via a Swarm global-job — see
	// internal/prune. Needs the same Docker access as cert renewal
	// (node.role==manager placement + /var/run/docker.sock bind mount),
	pruner := task.SerializeScheduled(prune.New(prune.LoadConfig()))
	scheduled = append(scheduled, pruner)
	tasks = append(tasks, pruner)

	// Add future tasks the same way: build them, wrap with
	// task.Serialize (or task.SerializeScheduled if they also run on
	// their own timer), append to tasks (and scheduled, if applicable).
	// Nothing else in this file needs to change.

	// Bounds how many task Runs — scheduled or on-demand — can actually
	// be doing work at the same instant, across this whole process. Most
	// scheduled tasks now default to clustering their first run near
	// 00:00 UTC (see each LoadConfig/LoadTargets above) specifically
	// because this exists to make that safe rather than a thundering
	// herd against S3/wal-g/NATS; on-demand NATS triggers are given
	// priority over scheduled runs waiting for the same slots — see
	// internal/taskpool. Default of 3 is a starting point, not a
	// measurement: tune SYSTEM_MANAGER_MAX_CONCURRENT_TASKS to whatever
	// the host's actual S3/CPU/network headroom supports.
	pool := taskpool.New(config.EnvIntDefault("SYSTEM_MANAGER_MAX_CONCURRENT_TASKS", 3))

	for _, t := range scheduled {
		go schedule.Loop(ctx, t, pool)
	}

	// The NATS connection needs NATS_NKEY_SEED/DOMAIN_NAME regardless of
	// which tasks are enabled (entrypoint.sh always requires them), so
	// it starts whenever there's at least one task to expose — not only
	// when backups are — rather than being gated on USE_PATRONI_TOOL
	// the way it used to be.
	if len(tasks) > 0 {
		go func() {
			if err := natssvc.Run(ctx, natssvc.LoadConfig(), tasks, pool); err != nil {
				log.Fatalf("nats service error: %v", err)
			}
		}()
	}

	// Kept for Docker's own HEALTHCHECK — the actual trigger API lives on
	// NATS now, this is deliberately just a liveness probe.
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if len(tasks) > 0 && !natssvc.Connected() {
			http.Error(w, "nats not connected", http.StatusServiceUnavailable)
			return
		}
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
