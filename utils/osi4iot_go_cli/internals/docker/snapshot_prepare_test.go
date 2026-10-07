package docker

import (
	"bytes"
	"errors"
	"log"
	"strings"
	"testing"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/snapshot"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// stubSnapshotCalls records what prepareForSnapshot asks system_manager.
func stubSnapshotCalls(t *testing.T, natsErr error) *[]string {
	t.Helper()
	var calls []string
	rec := func(name string, err error) func(*pt.PlatformData, *pt.DockerClient) (string, error) {
		return func(*pt.PlatformData, *pt.DockerClient) (string, error) {
			calls = append(calls, name)
			return "", err
		}
	}
	saved := []any{snapshotTriggerPatroniAdmin, snapshotTriggerPatroniMetrics, snapshotTriggerNats,
		snapshotFlushPatroniAdmin, snapshotFlushPatroniMetrics}
	snapshotTriggerPatroniAdmin = rec("backup patroni_admin", nil)
	snapshotTriggerPatroniMetrics = rec("backup patroni_metrics", nil)
	snapshotTriggerNats = rec("backup nats_streams", natsErr)
	snapshotFlushPatroniAdmin = rec("flush patroni_admin", nil)
	snapshotFlushPatroniMetrics = rec("flush patroni_metrics", nil)
	t.Cleanup(func() {
		snapshotTriggerPatroniAdmin = saved[0].(func(*pt.PlatformData, *pt.DockerClient) (string, error))
		snapshotTriggerPatroniMetrics = saved[1].(func(*pt.PlatformData, *pt.DockerClient) (string, error))
		snapshotTriggerNats = saved[2].(func(*pt.PlatformData, *pt.DockerClient) (string, error))
		snapshotFlushPatroniAdmin = saved[3].(func(*pt.PlatformData, *pt.DockerClient) (string, error))
		snapshotFlushPatroniMetrics = saved[4].(func(*pt.PlatformData, *pt.DockerClient) (string, error))
	})
	return &calls
}

var dataTargets = []snapshot.Target{snapshot.TargetPatroniAdmin, snapshot.TargetPatroniMetrics, snapshot.TargetNatsStreams}

// The reported case: a snapshot without --fresh carried the daily NATS
// backup, missing the streams created since. NATS is now backed up
// every time, like the Patroni WAL is flushed every time.
func TestSnapshotAlwaysBacksUpNats(t *testing.T) {
	calls := stubSnapshotCalls(t, nil)
	var out bytes.Buffer
	err := prepareForSnapshot(&pt.PlatformData{}, nil, SnapshotOptions{Targets: dataTargets}, log.New(&out, "", 0))
	if err != nil {
		t.Fatal(err)
	}
	want := "flush patroni_admin,flush patroni_metrics,backup nats_streams"
	if got := strings.Join(*calls, ","); got != want {
		t.Fatalf("calls %s, want %s", got, want)
	}
}

func TestSnapshotFreshBacksUpNatsOnce(t *testing.T) {
	calls := stubSnapshotCalls(t, nil)
	var out bytes.Buffer
	err := prepareForSnapshot(&pt.PlatformData{}, nil, SnapshotOptions{Targets: dataTargets, Fresh: true}, log.New(&out, "", 0))
	if err != nil {
		t.Fatal(err)
	}
	if n := strings.Count(strings.Join(*calls, ","), "backup nats_streams"); n != 1 {
		t.Fatalf("NATS backed up %d times: %v", n, *calls)
	}
}

func TestSnapshotNatsBackupFailureIsAWarning(t *testing.T) {
	stubSnapshotCalls(t, errors.New("system_manager unreachable"))
	var out bytes.Buffer
	err := prepareForSnapshot(&pt.PlatformData{}, nil,
		SnapshotOptions{Targets: []snapshot.Target{snapshot.TargetNatsStreams}}, log.New(&out, "", 0))
	if err != nil {
		t.Fatalf("a failed NATS backup stopped the snapshot: %v", err)
	}
	if !strings.Contains(out.String(), "carries the newest stored backup") {
		t.Fatalf("no warning:\n%s", out.String())
	}
}

func TestSnapshotWithoutNatsDoesNotBackItUp(t *testing.T) {
	calls := stubSnapshotCalls(t, nil)
	var out bytes.Buffer
	prepareForSnapshot(&pt.PlatformData{}, nil,
		SnapshotOptions{Targets: []snapshot.Target{snapshot.TargetPatroniAdmin}}, log.New(&out, "", 0))
	if strings.Contains(strings.Join(*calls, ","), "nats") {
		t.Fatalf("NATS backed up though not a target: %v", *calls)
	}
}
