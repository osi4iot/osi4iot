package statefile

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"time"

	"system_manager/internal/s3store"
	"system_manager/internal/task"
)

// maxBlobBytes caps what Backup will accept, as a sanity bound rather
// than a policy: a state file is a few KB, or a few hundred KB when
// GeoJSON floor plans are embedded in it. Anything past this is a
// caller sending the wrong thing, and the error says so instead of
// quietly filling a bucket.
//
// The real ceiling is lower and lives elsewhere: NATS's max_payload,
// 1 MB by default and not raised in this platform's server config. A
// request bigger than that is rejected by the server before this task
// ever sees it, so the CLI checks the size itself and fails with an
// explanation rather than letting the operator see a bare "maximum
// payload exceeded".
const maxBlobBytes = 8 << 20 // 8 MiB

// Backup stores one encrypted copy of the CLI's osi4iot_state.json in
// S3, under a timestamped key.
//
// On-demand only — it implements task.Task but NOT task.Scheduled.
// Unlike the Postgres and NATS backups, there is nothing here for a
// timer to act on: this service has no state file of its own, and the
// content only changes when the CLI changes it. So the CLI triggers a
// backup right after every successful write of the file, which makes
// "back up on every change" literal rather than "back up every night,
// and lose up to a day".
type Backup struct {
	cfg Config
}

var _ task.Task = (*Backup)(nil)

// NewBackup returns the backup task configured from cfg.
func NewBackup(cfg Config) *Backup { return &Backup{cfg: cfg} }

// Subject identifies this task for NATS routing, reachable at
// "system_manager.state_file.backup".
func (b *Backup) Subject() string { return "state_file.backup" }

// Run uploads the encrypted state file supplied in params["state"] (a
// base64 string, exactly as the CLI produced it) and prunes older runs
// beyond the configured retention.
//
// This is the first task in this service to actually read params, which
// natssvc has always decoded and passed through without inspecting. The
// validation lives here, where an error can name the field that's
// wrong, rather than in the transport.
func (b *Backup) Run(ctx context.Context, params map[string]any) (string, error) {
	blob := stringParam(params, "state")
	if blob == "" {
		return "", fmt.Errorf("no state file in the request: expected a base64 string in the \"state\" field")
	}
	if len(blob) > maxBlobBytes {
		return "", fmt.Errorf("state file is too large (%d bytes of base64, limit %d)", len(blob), maxBlobBytes)
	}
	// Decode only to verify it IS base64 and to store the compact form.
	// The result is ciphertext — this service cannot and should not be
	// able to tell whether what's inside is a valid state file.
	raw, err := base64.StdEncoding.DecodeString(blob)
	if err != nil {
		return "", fmt.Errorf("the \"state\" field is not valid base64: %w", err)
	}
	if len(raw) == 0 {
		return "", fmt.Errorf("the \"state\" field decodes to nothing")
	}

	cli, err := b.cfg.client(ctx)
	if err != nil {
		return "", fmt.Errorf("connecting to S3: %w", err)
	}

	tmp, err := writeTempFile([]byte(blob))
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp)

	key := newRunKey(cli, time.Now())
	if err := cli.UploadFile(ctx, tmp, key); err != nil {
		return "", fmt.Errorf("uploading the state file: %w", err)
	}
	log.Printf("[state_file] stored run %s (%d bytes)", runName(key), len(raw))

	summary := fmt.Sprintf("stored run %s in s3://%s/%s", runName(key), cli.Bucket(), key)

	// Pruning failing does not undo a successful upload — the backup is
	// safe, there are just more copies of it than intended. Report it
	// and move on rather than turning a working backup into a failed
	// request the CLI will retry.
	pruned, err := b.prune(ctx, cli)
	if err != nil {
		log.Printf("[state_file] WARNING: could not prune old runs: %v", err)
		return summary + fmt.Sprintf("\nWARNING: could not prune old runs: %v", err), nil
	}
	if pruned > 0 {
		summary += fmt.Sprintf("\npruned %d run(s) beyond the newest %d", pruned, b.cfg.retain)
	}
	return summary, nil
}

// prune deletes every run older than the newest cfg.retain, and returns
// how many it removed.
func (b *Backup) prune(ctx context.Context, cli *s3store.Client) (int, error) {
	if b.cfg.retain <= 0 {
		return 0, nil
	}

	runs, err := listRuns(ctx, cli) // newest first
	if err != nil {
		return 0, err
	}
	if len(runs) <= b.cfg.retain {
		return 0, nil
	}

	stale := runs[b.cfg.retain:]
	if err := cli.DeleteObjects(ctx, stale); err != nil {
		return 0, err
	}
	return len(stale), nil
}

