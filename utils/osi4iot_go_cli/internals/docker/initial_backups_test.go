package docker

import (
	"bytes"
	"errors"
	"log"
	"strings"
	"testing"
	"time"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// fakeInitial replaces everything TakeInitialBackups reaches out to and
// records the order of the backups it asks for.
type fakeInitial struct {
	calls      []string
	streams    [][]NatsStreamInfo // successive answers of ListNatsStreams
	listErr    error
	failFirstN map[string]int // backup target -> failures before success
}

func (f *fakeInitial) install(t *testing.T) {
	saved := []any{initialTriggerPatroniAdmin, initialTriggerPatroniMetrics, initialTriggerNats,
		initialTriggerStateFile, initialListNatsStreams, initialSleep}
	t.Cleanup(func() {
		initialTriggerPatroniAdmin = saved[0].(backupTrigger)
		initialTriggerPatroniMetrics = saved[1].(backupTrigger)
		initialTriggerNats = saved[2].(backupTrigger)
		initialTriggerStateFile = saved[3].(backupTrigger)
		initialListNatsStreams = saved[4].(func(*pt.PlatformData, *pt.DockerClient) ([]NatsStreamInfo, error))
		initialSleep = saved[5].(func(time.Duration))
	})
	trigger := func(name string) backupTrigger {
		return func(*pt.PlatformData, *pt.DockerClient) (string, error) {
			f.calls = append(f.calls, name)
			if f.failFirstN[name] > 0 {
				f.failFirstN[name]--
				return "", errors.New("not ready")
			}
			return name + " ok", nil
		}
	}
	initialTriggerPatroniAdmin = trigger("patroni_admin")
	initialTriggerPatroniMetrics = trigger("patroni_metrics")
	initialTriggerNats = trigger("nats_streams")
	initialTriggerStateFile = trigger("state_file")
	initialListNatsStreams = func(*pt.PlatformData, *pt.DockerClient) ([]NatsStreamInfo, error) {
		if f.listErr != nil {
			return nil, f.listErr
		}
		if len(f.streams) == 0 {
			return nil, nil
		}
		answer := f.streams[0]
		if len(f.streams) > 1 {
			f.streams = f.streams[1:]
		}
		return answer, nil
	}
	initialSleep = func(time.Duration) {}
}

func platform(patroni bool) *pt.PlatformData {
	pd := &pt.PlatformData{}
	pd.PlatformInfo.UsePatroniTool = patroni
	pd.PlatformInfo.NATSBackupS3Prefix = "s3://osi4iot/backups/nats_streams"
	pd.PlatformInfo.StateFileS3Prefix = "s3://osi4iot/backups/state_file"
	return pd
}

func run(pd *pt.PlatformData) string {
	var out bytes.Buffer
	TakeInitialBackups(pd, nil, log.New(&out, "", 0))
	return out.String()
}

var oneStream = []NatsStreamInfo{{Name: "DEVICES"}}

func TestInitialBackupsTakesAllFourInOrder(t *testing.T) {
	f := &fakeInitial{streams: [][]NatsStreamInfo{oneStream}}
	f.install(t)
	out := run(platform(true))

	want := "patroni_admin,patroni_metrics,nats_streams,state_file"
	if got := strings.Join(f.calls, ","); got != want {
		t.Fatalf("backups = %s, want %s", got, want)
	}
	if strings.Contains(out, "Warning") {
		t.Fatalf("unexpected warning:\n%s", out)
	}
}

func TestInitialBackupsWithoutPatroniStillBacksUpNatsAndState(t *testing.T) {
	// The old code returned before doing anything without Patroni.
	f := &fakeInitial{streams: [][]NatsStreamInfo{oneStream}}
	f.install(t)
	run(platform(false))
	if got := strings.Join(f.calls, ","); got != "nats_streams,state_file" {
		t.Fatalf("backups = %s", got)
	}
}

func TestInitialNatsBackupWaitsForStreams(t *testing.T) {
	// Services create their streams a little after reporting healthy.
	f := &fakeInitial{streams: [][]NatsStreamInfo{nil, nil, oneStream}}
	f.install(t)
	run(platform(false))
	if f.calls[0] != "nats_streams" {
		t.Fatalf("NATS backup not taken once the streams appeared: %v", f.calls)
	}
}

func TestInitialNatsBackupSkippedWhenNoStreams(t *testing.T) {
	f := &fakeInitial{}
	f.install(t)
	out := run(platform(false))
	if strings.Join(f.calls, ",") != "state_file" {
		t.Fatalf("backups = %v: asked for a NATS backup of nothing", f.calls)
	}
	if !strings.Contains(out, "no JetStream streams exist yet") {
		t.Fatalf("operator not told why:\n%s", out)
	}
}

func TestInitialNatsBackupAskedEvenIfCLICannotListStreams(t *testing.T) {
	// The CLI may not reach NATS from outside; system_manager can.
	f := &fakeInitial{listErr: errors.New("connection refused")}
	f.install(t)
	run(platform(false))
	if f.calls[0] != "nats_streams" {
		t.Fatalf("backups = %v", f.calls)
	}
}

func TestInitialBackupsRetryAndNeverAbort(t *testing.T) {
	f := &fakeInitial{
		streams:    [][]NatsStreamInfo{oneStream},
		failFirstN: map[string]int{"patroni_admin": 2, "nats_streams": 99},
	}
	f.install(t)
	out := run(platform(true))

	if !strings.Contains(out, "patroni_admin backed up.") {
		t.Fatalf("transient failure not retried:\n%s", out)
	}
	if !strings.Contains(out, "osi4iot backup trigger nats_streams") {
		t.Fatalf("persistent failure does not name the command:\n%s", out)
	}
	if f.calls[len(f.calls)-1] != "state_file" {
		t.Fatal("a failed backup stopped the ones after it")
	}
}

func runFinal(pd *pt.PlatformData) ([]string, string) {
	var out bytes.Buffer
	failed := TakeFinalBackups(pd, nil, log.New(&out, "", 0))
	return failed, out.String()
}

func TestFinalBackupsTakeAllFourAndReportNoFailures(t *testing.T) {
	f := &fakeInitial{streams: [][]NatsStreamInfo{oneStream}}
	f.install(t)
	failed, out := runFinal(platform(true))
	if got := strings.Join(f.calls, ","); got != "patroni_admin,patroni_metrics,nats_streams,state_file" {
		t.Fatalf("backups = %s", got)
	}
	if len(failed) != 0 || strings.Contains(out, "Warning") {
		t.Fatalf("failed=%v\n%s", failed, out)
	}
}

func TestFinalBackupsReturnWhatFailed(t *testing.T) {
	f := &fakeInitial{
		streams:    [][]NatsStreamInfo{oneStream},
		failFirstN: map[string]int{"nats_streams": 99},
	}
	f.install(t)
	failed, out := runFinal(platform(true))
	if strings.Join(failed, ",") != "nats_streams" {
		t.Fatalf("failed = %v", failed)
	}
	// Before a delete there is no "later" to take it: no such advice.
	if strings.Contains(out, "when convenient") || !strings.Contains(out, "as of its last backup") {
		t.Fatalf("message:\n%s", out)
	}
	if f.calls[len(f.calls)-1] != "state_file" {
		t.Fatal("a failure stopped the backups after it")
	}
}

func TestFinalBackupsDoNotWaitForStreams(t *testing.T) {
	// No streams: nothing to back up, and not a failure — and no minute
	// spent waiting for streams to appear, as after a deployment.
	f := &fakeInitial{}
	f.install(t)
	sleeps := 0
	initialSleep = func(time.Duration) { sleeps++ }
	failed, out := runFinal(platform(false))
	if len(failed) != 0 || strings.Join(f.calls, ",") != "state_file" {
		t.Fatalf("failed=%v calls=%v", failed, f.calls)
	}
	if sleeps != 0 {
		t.Fatalf("waited %d polls for streams before a delete", sleeps)
	}
	if !strings.Contains(out, "no JetStream streams; nothing to back up") {
		t.Fatalf("message:\n%s", out)
	}
}
