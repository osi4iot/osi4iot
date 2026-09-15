package patroni_backup

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"system_manager/internal/config"
	"system_manager/internal/task"
)

// flushTimeout bounds a WAL flush. Kept just above the sidecar's own
// two-minute budget so the failure surfaces there, with PostgreSQL's
// own message attached, rather than as a bare timeout here.
const flushTimeout = 150 * time.Second

// FlushWAL closes the current WAL segment on one cluster's primary and
// waits until the archiver has pushed it.
//
// It exists for the restore flow in the platform CLI, which must not
// destroy PGDATA while committed transactions are still only in the
// local pg_wal. With archive_timeout at 1800s, up to thirty minutes of
// data can be in exactly that state at any moment.
//
// Why it goes through the sidecar rather than the CLI reaching Postgres
// itself: pg_switch_wal() only works on the primary, and haproxy
// already routes the sidecar port to whichever node currently holds
// that role. The CLI would otherwise have to find the leader first and
// exec into the right container.
//
// On-demand only — it implements task.Task but not task.Scheduled.
// Forcing a segment switch on a timer would defeat the point of
// archive_timeout.
type FlushWAL struct {
	Name string

	flushURL string
}

var _ task.Task = FlushWAL{}

// LoadFlushWALs reads the admin/metrics flush endpoints from the
// environment, mirroring LoadTargets and LoadBackupLists.
func LoadFlushWALs() []FlushWAL {
	return []FlushWAL{
		{
			Name:     "admin",
			flushURL: config.EnvStringDefault("PATRONI_SIDECAR_FLUSH_URL_ADMIN", "http://haproxy_patroni:5002/flush_wal"),
		},
		{
			Name:     "metrics",
			flushURL: config.EnvStringDefault("PATRONI_SIDECAR_FLUSH_URL_METRICS", "http://haproxy_patroni:5102/flush_wal"),
		},
	}
}

// Subject identifies this task for NATS routing as
// "patroni.flush_wal.<name>" — under the same "patroni." prefix as
// trigger_backup, backup_list and leader, so a deployment granting NATS
// permissions at that grain keeps working. See auth_callout's infra.go.
func (f FlushWAL) Subject() string {
	return "patroni.flush_wal." + f.Name
}

// Run asks the sidecar to switch and archive, and returns its summary.
//
// A failure here is meant to stop a restore in its tracks: if the
// archive is not receiving WAL, the newest recoverable point is older
// than the caller thinks, and that is worth knowing before anything is
// deleted. params is unused.
func (f FlushWAL) Run(ctx context.Context, params map[string]any) (string, error) {
	reqCtx, cancel := context.WithTimeout(ctx, flushTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, f.flushURL, nil)
	if err != nil {
		return "", fmt.Errorf("building request: %w", err)
	}
	setSidecarAuth(req)

	client := &http.Client{Timeout: flushTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling patroni_sidecar to flush %s WAL: %w", f.Name, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	message := strings.TrimSpace(string(body))

	switch {
	case resp.StatusCode == http.StatusOK:
		return message, nil
	case resp.StatusCode == http.StatusNotFound:
		// A patroni_sidecar image predating this endpoint. Name what is
		// missing instead of reporting a 404 body as a flush failure.
		return "", fmt.Errorf("patroni_sidecar has no /flush_wal endpoint "+
			"(%s returned 404) — the sidecar image needs updating", f.flushURL)
	case resp.StatusCode == http.StatusServiceUnavailable:
		// haproxy has no primary to route to.
		return "", fmt.Errorf("no primary available in the %s cluster, so WAL cannot be flushed: %s",
			f.Name, message)
	default:
		return "", fmt.Errorf("flushing %s WAL failed (%s): %s", f.Name, resp.Status, message)
	}
}

