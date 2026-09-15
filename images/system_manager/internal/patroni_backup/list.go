package patroni_backup

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"system_manager/internal/config"
	"system_manager/internal/task"
)

// This file adds `backup list patroni_admin|patroni_metrics` support,
// completing the trigger/restore/list set the other backup targets
// already have.
//
// It is the awkward one, and worth being clear about why. For the NATS
// streams and the state file, "what backups exist" is answerable by
// listing an S3 prefix, because each backup IS an object. WAL-G's are
// not: a base backup is a directory of segments plus a manifest, delta
// backups reference a parent, and the WAL segments needed to make any
// of it consistent live somewhere else again. Listing the prefix would
// report objects, not restorable backups, and would silently omit the
// one fact that decides whether a backup is usable — whether its parent
// chain is intact.
//
// WAL-G's own catalogue is the only authority, so this asks it, through
// the same patroni_sidecar sidecar that already runs backup-push (see
// backup.go's package comment for why wal-g runs there and not here).
//
// # Requires a sidecar endpoint
//
// The sidecar must expose GET /backup_list returning `wal-g backup-list
// --json --detail` output verbatim. See MIGRATION_NOTES for the handler.

// listTimeout bounds a catalogue lookup. Unlike triggerTimeout's two
// hours, this reads a manifest and returns — if it has not answered in
// a minute, something is wrong rather than slow.
const listTimeout = 60 * time.Second

// BackupList reports the WAL-G catalogue for one Postgres cluster.
//
// On-demand only: it implements task.Task but not task.Scheduled, like
// patroni.LeaderQuery. A listing is a question, not a job.
type BackupList struct {
	Name string

	listURL string
}

var _ task.Task = BackupList{}

// LoadBackupLists reads the admin/metrics catalogue endpoints from the
// environment, mirroring LoadTargets.
//
// The URLs are their own variables rather than derived from
// PATRONI_SIDECAR_URL_* by string surgery: those point at
// /trigger_backup, and rewriting a path segment to guess a sibling
// endpoint breaks quietly the moment someone puts the sidecar behind a
// different route.
func LoadBackupLists() []BackupList {
	return []BackupList{
		{
			Name:    "admin",
			listURL: config.EnvStringDefault("PATRONI_SIDECAR_LIST_URL_ADMIN", "http://haproxy_patroni:5002/backup_list"),
		},
		{
			Name:    "metrics",
			listURL: config.EnvStringDefault("PATRONI_SIDECAR_LIST_URL_METRICS", "http://haproxy_patroni:5102/backup_list"),
		},
	}
}

// Subject identifies this task for NATS routing as
// "patroni.backup_list.<name>", which natssvc turns into
// "system_manager.patroni.backup_list.admin" — under the same
// "patroni." prefix as trigger_backup and leader, so a deployment
// granting NATS permissions at that grain keeps working. See
// auth_callout's infra.go.
func (l BackupList) Subject() string {
	return "patroni.backup_list." + l.Name
}

// BackupInfo is one entry in the catalogue, normalized.
//
// Normalizing here rather than passing WAL-G's own JSON through to the
// CLI keeps the version-specific field names in one place: WAL-G has
// renamed and added fields across releases, and the CLI should not have
// to know which release produced a given reply.
type BackupInfo struct {
	Name string `json:"name"`
	// Time is when the backup finished, RFC3339, or "" if WAL-G did not
	// report it.
	Time string `json:"time,omitempty"`
	// Kind is "full" or "delta". The distinction is the point of the
	// whole listing: a delta is only restorable if every ancestor up to
	// its base is still present, so an operator choosing a backup needs
	// to see which ones carry that dependency.
	Kind string `json:"kind"`
	// ParentName is the backup this delta builds on, empty for a full.
	ParentName string `json:"parent_name,omitempty"`
	// CompressedSize is the stored size in bytes, 0 if unreported.
	CompressedSize int64 `json:"compressed_size,omitempty"`
	// PgVersion is the PostgreSQL version that produced it, 0 if
	// unreported. Worth surfacing: restoring into a different major
	// version does not work, and a catalogue spanning an upgrade will
	// show the boundary.
	PgVersion int `json:"pg_version,omitempty"`
	// ChainBroken is true when this is a delta whose parent is not in
	// the catalogue — it cannot be restored from, and nothing in WAL-G's
	// own output says so directly.
	ChainBroken bool `json:"chain_broken,omitempty"`
	// SystemIdentifier is the PostgreSQL cluster this backup came from.
	//
	// Reported because it is the only reliable way to tell whether a
	// LIVE cluster is the same one these backups belong to. After the
	// volumes are lost, Patroni bootstraps a brand new, empty cluster
	// with a different identifier — which looks exactly like a healthy
	// primary to anything that only checks whether a primary exists.
	SystemIdentifier uint64 `json:"system_identifier,omitempty"`
}

// walgBackup mirrors the fields of `wal-g backup-list --json --detail`
// this code uses. Every one is optional: WAL-G's output has changed
// shape across versions, and a missing field should degrade the listing
// rather than fail it.
type walgBackup struct {
	BackupName       string `json:"backup_name"`
	Time             string `json:"time"`
	FinishTime       string `json:"finish_time"`
	StartTime        string `json:"start_time"`
	CompressedSize   int64  `json:"compressed_size"`
	PgVersion        int    `json:"pg_version"`
	SystemIdentifier uint64 `json:"system_identifier"`
}

// Run asks the sidecar for the catalogue and replies with a JSON array
// of BackupInfo, newest first.
//
// JSON rather than the human-readable summary the trigger tasks return:
// this output is consumed by the CLI, which formats it. params is
// unused.
func (l BackupList) Run(ctx context.Context, params map[string]any) (string, error) {
	raw, err := l.fetch(ctx)
	if err != nil {
		return "", err
	}

	var backups []walgBackup
	if err := json.Unmarshal(raw, &backups); err != nil {
		return "", fmt.Errorf("could not parse the wal-g catalogue for %s "+
			"(expected `wal-g backup-list --json --detail` output): %w", l.Name, err)
	}

	infos := normalizeBackups(backups)
	out, err := json.Marshal(infos)
	if err != nil {
		return "", fmt.Errorf("encoding the backup list: %w", err)
	}
	return string(out), nil
}

// fetch performs the sidecar request.
func (l BackupList) fetch(ctx context.Context) ([]byte, error) {
	reqCtx, cancel := context.WithTimeout(ctx, listTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, l.listURL, nil)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	setSidecarAuth(req)

	client := &http.Client{Timeout: listTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling patroni_sidecar for the %s catalogue: %w", l.Name, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		// A deployment whose patroni_sidecar predates the /backup_list
		// endpoint. Say what is missing rather than reporting a parse
		// failure on an HTML 404 page.
		return nil, fmt.Errorf("patroni_sidecar has no /backup_list endpoint "+
			"(%s returned 404) — the sidecar image needs updating", l.listURL)
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("patroni_sidecar rejected the request for the %s catalogue: "+
			"PATRONI_SIDECAR_API_TOKEN does not match the sidecar's", l.Name)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("patroni_sidecar returned %s for the %s catalogue: %s",
			resp.Status, l.Name, strings.TrimSpace(string(body)))
	}

	// An empty catalogue is a valid answer, and wal-g reports it as
	// literal "null" rather than "[]". Normalize so the caller's
	// json.Unmarshal doesn't have to special-case it.
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" || trimmed == "null" {
		return []byte("[]"), nil
	}
	return []byte(trimmed), nil
}

// normalizeBackups converts WAL-G's entries into BackupInfo, newest
// first, and marks deltas whose parent is missing.
func normalizeBackups(backups []walgBackup) []BackupInfo {
	present := make(map[string]bool, len(backups))
	for _, b := range backups {
		present[b.BackupName] = true
	}

	infos := make([]BackupInfo, 0, len(backups))
	for _, b := range backups {
		kind, parent := classifyBackup(b.BackupName)
		info := BackupInfo{
			Name:             b.BackupName,
			Time:             firstNonEmpty(b.FinishTime, b.Time, b.StartTime),
			Kind:             kind,
			ParentName:       parent,
			CompressedSize:   b.CompressedSize,
			PgVersion:        b.PgVersion,
			SystemIdentifier: b.SystemIdentifier,
		}
		if kind == "delta" && parent != "" && !present[parent] {
			info.ChainBroken = true
		}
		infos = append(infos, info)
	}

	// WAL-G's backup names embed the LSN, so they do not sort
	// chronologically as strings the way the timestamp-named runs
	// elsewhere in this service do. Sort on the reported time, falling
	// back to the name so the order stays stable when a time is
	// missing.
	sort.SliceStable(infos, func(i, j int) bool {
		if infos[i].Time != infos[j].Time {
			return infos[i].Time > infos[j].Time
		}
		return infos[i].Name > infos[j].Name
	})
	return infos
}

// classifyBackup reads WAL-G's naming convention: a full backup is
// "base_<LSN>", a delta is "base_<LSN>_D_<parent LSN>". Deriving this
// from the name is not a shortcut — WAL-G's JSON has carried the
// parent under different keys across versions, while the name format
// has been stable.
func classifyBackup(name string) (kind, parent string) {
	const deltaMarker = "_D_"
	i := strings.Index(name, deltaMarker)
	if i < 0 {
		return "full", ""
	}
	parentLSN := name[i+len(deltaMarker):]
	return "delta", "base_" + parentLSN
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}