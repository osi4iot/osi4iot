package nats_backup

import (
	"context"
	"encoding/json"
	"fmt"

	"system_manager/internal/task"
)

// List reports which backup runs exist in S3, so the platform CLI can
// show the operator what there is before asking to restore any of it
// (`osi4iot backup list nats_streams`).
//
// It exists because Restore deliberately always takes the most recent
// run and nothing else — a reasonable default that leaves the operator
// with no way to see whether that run is from an hour ago or from
// before the incident they are recovering from. Listing is read-only
// and answers exactly that.
//
// On-demand only, like Restore: it implements task.Task but not
// task.Scheduled. There is nothing for a timer to do with a listing.
type List struct {
	cfg Config
}

var _ task.Task = List{}

// NewList builds the List task from cfg. Wrap the result with
// task.Serialize before handing it to natssvc.Run — see main.go.
func NewList(cfg Config) List { return List{cfg: cfg} }

// Subject identifies this task for NATS routing and logging as
// "nats_streams.list" — "system_manager.nats_streams.list" once natssvc
// nests it, alongside "nats_streams.backup" and ".restore".
func (l List) Subject() string { return "nats_streams.list" }

// RunInfo describes one backup run for the CLI.
type RunInfo struct {
	// Name is the run's UTC timestamp identifier (20060102T150405Z).
	Name string `json:"name"`
	// Streams is how many stream snapshots the run holds. Worth
	// reporting because a run with fewer streams than the others is the
	// signature of a backup that was interrupted partway through, and
	// that is precisely the run not to restore from.
	Streams int `json:"streams"`
}

// Run replies with a JSON array of runs, NEWEST FIRST.
//
// JSON rather than the human-readable summary the other tasks return:
// this output is consumed by the CLI, which formats it. Newest first
// rather than listRuns' oldest-first because that is the order an
// operator reads a backup list in, and it puts the run Restore would
// pick at the top.
func (l List) Run(ctx context.Context, params map[string]any) (string, error) {
	s3c, err := newS3Client(ctx, l.cfg)
	if err != nil {
		return "", err
	}

	runs, err := listRuns(ctx, s3c) // oldest first
	if err != nil {
		return "", err
	}

	infos := make([]RunInfo, 0, len(runs))
	for i := len(runs) - 1; i >= 0; i-- {
		run := runs[i]
		objects, err := listRunObjects(ctx, s3c, run)
		if err != nil {
			return "", err
		}
		infos = append(infos, RunInfo{Name: run, Streams: len(objects)})
	}

	out, err := json.Marshal(infos)
	if err != nil {
		return "", fmt.Errorf("encoding the run list: %w", err)
	}
	return string(out), nil
}
