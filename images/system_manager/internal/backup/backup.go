// Package backup triggers the scheduled WAL-G backups for the
// patroni-admin and patroni-metrics Postgres clusters.
//
// The backup itself (backup-push) AND its retention cleanup (delete
// retain) are NOT run here — both are delegated over HTTP, in a single
// call, to the backup_trigger sidecar running inside whichever node is
// currently primary (routed there by haproxy_patroni, regardless of
// which physical node that is). That sidecar runs wal-g in LOCAL mode,
// with direct filesystem access to PGDATA — the mature, well-tested
// wal-g code path — instead of this process running wal-g in "remote
// backup" (streaming) mode, which as of wal-g v3.0.8 has a known
// compatibility bug against PostgreSQL 18.
//
// system_manager stays the single source of truth for the RETENTION
// POLICY (how many full backups to keep) — it's sent as a query
// parameter on each trigger call — even though the retention command
// itself now runs on the Patroni node. This process needs no wal-g
// binary and no S3/WAL-G credentials of its own anymore.
package backup

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"system_manager/internal/config"
	"system_manager/internal/schedule"
	"system_manager/internal/task"
)

// triggerTimeout bounds how long we wait for the backup_trigger sidecar
// to finish backup-push + retention cleanup. Generous and matched to
// backup_trigger's own internal timeout, so our request doesn't time
// out before it would.
const triggerTimeout = 2 * time.Hour

// Target is one Postgres cluster this service takes backups of. It
// implements task.Scheduled: Subject/Run so it can be triggered on
// demand over NATS (via internal/natssvc), and NextRun so it also runs
// automatically once a day (via internal/schedule).
type Target struct {
	Name string

	triggerURL string
	backupHour int // UTC hour of day to run backup-push
	retain     int // number of full backups to keep
}

var _ task.Scheduled = Target{}

// LoadTargets reads the admin/metrics backup targets from the environment.
// Aborts the process (via config.MustEnv) if a required variable is
// missing — entrypoint.sh checks the same list before this process ever
// starts, so in practice this only fires on a misconfigured deployment.
func LoadTargets() []Target {
	return []Target{
		{
			Name:       "admin",
			triggerURL: config.EnvStringDefault("BACKUP_TRIGGER_URL_ADMIN", "http://haproxy_patroni:5002/trigger/backup"),
			backupHour: config.EnvIntDefault("SYSTEM_MANAGER_BACKUP_HOUR_ADMIN", 3),
			retain:     config.EnvIntDefault("SYSTEM_MANAGER_RETAIN_ADMIN", 7),
		},
		{
			Name:       "metrics",
			triggerURL: config.EnvStringDefault("BACKUP_TRIGGER_URL_METRICS", "http://haproxy_patroni:5102/trigger/backup"),
			backupHour: config.EnvIntDefault("SYSTEM_MANAGER_BACKUP_HOUR_METRICS", 4),
			retain:     config.EnvIntDefault("SYSTEM_MANAGER_RETAIN_METRICS", 7),
		},
	}
}

// requestURL builds t.triggerURL with the retention policy attached as
// ?retain=N, so backup_trigger knows how many full backups to keep
// without system_manager's retention policy having to be duplicated
// into every Patroni node's own configuration.
func (t Target) requestURL() (string, error) {
	u, err := url.Parse(t.triggerURL)
	if err != nil {
		return "", fmt.Errorf("parsing trigger URL: %w", err)
	}
	q := u.Query()
	q.Set("retain", strconv.Itoa(t.retain))
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// TriggerBackup asks the primary node's backup_trigger sidecar to run
// backup-push (then prune to t.retain full backups) locally, and blocks
// until it's done — backup_trigger itself is synchronous for exactly
// this reason, so the caller knows whether it actually succeeded.
// Returns backup_trigger's own response body (the raw wal-g output)
// alongside any error, so callers can both log or relay it.
func (t Target) TriggerBackup(ctx context.Context) (string, error) {
	reqURL, err := t.requestURL()
	if err != nil {
		return "", err
	}

	reqCtx, cancel := context.WithTimeout(ctx, triggerTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, reqURL, nil)
	if err != nil {
		return "", fmt.Errorf("building request: %w", err)
	}

	client := &http.Client{Timeout: triggerTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling backup_trigger: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	output := string(body)

	if resp.StatusCode != http.StatusOK {
		return output, fmt.Errorf("backup_trigger returned %s", resp.Status)
	}
	return output, nil
}

// Run executes a one-off backup-push (see TriggerBackup) and satisfies
// task.Task. It's used both by schedule.Loop, for t's own daily
// schedule, and by natssvc, for on-demand NATS triggers — main.go wraps
// every Target with task.SerializeScheduled so the two never run
// concurrently against the same target.
func (t Target) Run(ctx context.Context) (string, error) {
	return t.TriggerBackup(ctx)
}

// Subject identifies this target for NATS routing and logging as
// "backup.patroni.<name>" (e.g. "backup.patroni.admin"), which
// natssvc turns into the subject "system_manager.backup.patroni.admin".
// See auth_callout's infra.go for the permissions granted to
// system_manager's NKey on this subject tree.
func (t Target) Subject() string {
	return "backup.patroni." + t.Name
}

// NextRun returns the next UTC occurrence of t's configured backup
// hour, satisfying task.Scheduled.
func (t Target) NextRun(now time.Time) time.Time {
	return schedule.DailyAt(now, t.backupHour)
}
