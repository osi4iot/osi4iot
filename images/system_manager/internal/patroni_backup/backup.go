// Package backup triggers the scheduled WAL-G backups for the
// patroni_admin and patroni_metrics Postgres clusters.
//
// The backup itself (backup-push) AND its retention cleanup (delete
// retain) are NOT run here — both are delegated over HTTP, in a single
// call, to the patroni_sidecar sidecar running inside whichever node is
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
package patroni_backup

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

// triggerTimeout bounds how long we wait for the patroni_sidecar sidecar
// to finish backup-push + retention cleanup. Generous and matched to
// patroni_sidecar's own internal timeout, so our request doesn't time
// out before it would.
const triggerTimeout = 2 * time.Hour

// Target is one Postgres cluster this service takes backups of. It
// implements task.Scheduled: Subject/Run so it can be triggered on
// demand over NATS (via internal/natssvc), and NextRun so it also runs
// automatically once a day by default (via internal/schedule).
type Target struct {
	Name string

	triggerURL string
	backupHour int // UTC hour of day this Target's schedule starts at
	everyHours int // repeats every this many hours after backupHour; 24 (once a day) if unset — see schedule.EveryNHoursAt
	retain     int // number of full backups to keep
}

var _ task.Scheduled = Target{}

// LoadTargets reads the admin/metrics backup targets from the environment.
// Aborts the process (via config.MustEnv) if a required variable is
// missing — entrypoint.sh checks the same list before this process ever
// starts, so in practice this only fires on a misconfigured deployment.
//
// Default hours are staggered (0, 1) rather than identical: distinct
// clock times, both still clustered near midnight, keep admin and
// metrics' backup-push calls from landing on patroni_sidecar in the
// exact same instant by default, on top of whatever taskpool.Pool
// itself already bounds. Override with SYSTEM_MANAGER_BACKUP_HOUR_ADMIN/
// _METRICS if a deployment wants them further apart, or the same.
func LoadTargets() []Target {
	return []Target{
		{
			Name:       "admin",
			triggerURL: config.EnvStringDefault("PATRONI_SIDECAR_URL_ADMIN", "http://haproxy_patroni:5002/trigger_backup"),
			backupHour: config.EnvIntDefault("SYSTEM_MANAGER_BACKUP_HOUR_ADMIN", 0),
			everyHours: config.EnvIntDefault("SYSTEM_MANAGER_BACKUP_EVERY_HOURS_ADMIN", 24),
			retain:     config.EnvIntDefault("SYSTEM_MANAGER_RETAIN_ADMIN", 7),
		},
		{
			Name:       "metrics",
			triggerURL: config.EnvStringDefault("PATRONI_SIDECAR_URL_METRICS", "http://haproxy_patroni:5102/trigger_backup"),
			backupHour: config.EnvIntDefault("SYSTEM_MANAGER_BACKUP_HOUR_METRICS", 1),
			everyHours: config.EnvIntDefault("SYSTEM_MANAGER_BACKUP_EVERY_HOURS_METRICS", 24),
			retain:     config.EnvIntDefault("SYSTEM_MANAGER_RETAIN_METRICS", 7),
		},
	}
}

// requestURL builds t.triggerURL with the retention policy attached as
// ?retain=N, so patroni_sidecar knows how many full backups to keep
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

// TriggerBackup asks the primary node's patroni_sidecar sidecar to run
// backup-push (then prune to t.retain full backups) locally, and blocks
// until it's done — patroni_sidecar itself is synchronous for exactly
// this reason, so the caller knows whether it actually succeeded.
// Returns patroni_sidecar's own response body (the raw wal-g output)
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
		return "", fmt.Errorf("calling patroni_sidecar: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	output := string(body)

	if resp.StatusCode != http.StatusOK {
		return output, fmt.Errorf("patroni_sidecar returned %s", resp.Status)
	}
	return output, nil
}

// Run executes a one-off backup-push (see TriggerBackup) and satisfies
// task.Task. It's used both by schedule.Loop, for t's own daily
// schedule, and by natssvc, for on-demand NATS triggers — main.go wraps
// every Target with task.SerializeScheduled so the two never run
// concurrently against the same target. params is unused — nothing
// about a backup-push is caller-configurable beyond t's own retention
// policy.
func (t Target) Run(ctx context.Context, params map[string]any) (string, error) {
	return t.TriggerBackup(ctx)
}

// Subject identifies this target for NATS routing and logging as
// "patroni.trigger_backup.<name>" (e.g. "patroni.trigger_backup.admin"),
// which natssvc turns into the subject
// "system_manager.patroni.trigger_backup.admin" — grouped under
// "patroni." alongside patroni.LeaderQuery's "patroni.leader.<name>", so
// every Patroni-related task (mutating or read-only) lives under one
// prefix ("system_manager.patroni.>"), with "trigger_backup" vs
// "leader" as the next segment for anyone who wants to grant NATS
// permissions at that finer grain instead. See auth_callout's infra.go.
func (t Target) Subject() string {
	return "patroni.trigger_backup." + t.Name
}

// NextRun returns the next UTC occurrence of t's configured backup
// schedule — once a day by default, or every t.everyHours if
// configured — satisfying task.Scheduled. See schedule.EveryNHoursAt.
func (t Target) NextRun(now time.Time) time.Time {
	return schedule.EveryNHoursAt(now, t.backupHour, t.everyHours)
}
