package statefile

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"system_manager/internal/task"
)

// Restore returns a stored state file to the caller. On-demand only,
// like nats_backup's Restore and patroni's switchover tasks.
//
// It hands back the ciphertext untouched. The decrypting, the
// re-encrypting under whatever passphrase the receiving machine uses,
// and the writing to disk all happen in the CLI — this service has
// neither the key nor any business holding the platform's credentials
// in memory. "Restore" here means "fetch"; the CLI does the rest.
//
// Unlike nats_backup.Restore, this one IS parameterized: an optional
// "run" selects a specific backup instead of the newest. That
// difference is deliberate. Restoring a NATS stream to an older
// snapshot is a strange thing to want and a dangerous thing to make
// easy; restoring a state file to an older version is the entire point
// when the newest one is the broken one.
type Restore struct {
	cfg Config
}

var _ task.Task = (*Restore)(nil)

// NewRestore returns the restore task configured from cfg.
func NewRestore(cfg Config) *Restore { return &Restore{cfg: cfg} }

// Subject identifies this task for NATS routing, reachable at
// "system_manager.state_file.restore".
func (r *Restore) Subject() string { return "state_file.restore" }

// Run returns the requested run's encrypted state file as the base64
// string it was stored as. params["run"] names a specific run (as
// reported by List); omitting it means the most recent one.
func (r *Restore) Run(ctx context.Context, params map[string]any) (string, error) {
	cli, err := r.cfg.client(ctx)
	if err != nil {
		return "", fmt.Errorf("connecting to S3: %w", err)
	}

	runs, err := listRuns(ctx, cli) // newest first
	if err != nil {
		return "", fmt.Errorf("listing stored state files: %w", err)
	}
	if len(runs) == 0 {
		return "", fmt.Errorf("no state file backups in s3://%s/%s", cli.Bucket(), cli.GroupPrefix(""))
	}

	key := runs[0]
	if wanted := stringParam(params, "run"); wanted != "" {
		key = ""
		for _, k := range runs {
			if runName(k) == wanted {
				key = k
				break
			}
		}
		if key == "" {
			return "", fmt.Errorf("no such run %q — %d available, newest is %s",
				wanted, len(runs), runName(runs[0]))
		}
	}

	tmp, err := writeTempFile(nil)
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp)

	if err := cli.DownloadFile(ctx, key, tmp); err != nil {
		return "", fmt.Errorf("downloading %s: %w", key, err)
	}
	blob, err := os.ReadFile(tmp)
	if err != nil {
		return "", fmt.Errorf("reading the downloaded state file: %w", err)
	}
	if len(strings.TrimSpace(string(blob))) == 0 {
		return "", fmt.Errorf("stored run %s is empty", runName(key))
	}

	log.Printf("[state_file] returning run %s (%d bytes)", runName(key), len(blob))
	return strings.TrimSpace(string(blob)), nil
}

// List reports which backups exist, so the CLI can show the operator
// what there is to restore before asking for one of them.
//
// Without it, Restore's "run" parameter is unusable: nothing else tells
// the caller what a valid run name looks like or when each was taken.
type List struct {
	cfg Config
}

var _ task.Task = (*List)(nil)

// NewList returns the list task configured from cfg.
func NewList(cfg Config) *List { return &List{cfg: cfg} }

// Subject identifies this task for NATS routing, reachable at
// "system_manager.state_file.list".
func (l *List) Subject() string { return "state_file.list" }

// Run replies with a JSON array of run names, newest first. JSON rather
// than the human-readable summary every other task returns, because
// this one's output is consumed by the CLI, not read by a person — the
// CLI formats it (see `osi4iot state list`).
func (l *List) Run(ctx context.Context, params map[string]any) (string, error) {
	cli, err := l.cfg.client(ctx)
	if err != nil {
		return "", fmt.Errorf("connecting to S3: %w", err)
	}

	runs, err := listRuns(ctx, cli)
	if err != nil {
		return "", fmt.Errorf("listing stored state files: %w", err)
	}

	names := make([]string, 0, len(runs))
	for _, k := range runs {
		names = append(names, runName(k))
	}
	out, err := json.Marshal(names)
	if err != nil {
		return "", fmt.Errorf("encoding the run list: %w", err)
	}
	return string(out), nil
}
