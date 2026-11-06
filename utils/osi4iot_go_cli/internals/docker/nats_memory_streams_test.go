package docker

import (
	"strings"
	"testing"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// pipelines keeps its leases in a KV in memory, which system_manager does
// not back up (NATS cannot snapshot memory streams).
var withLeaderInMemory = []NatsStreamInfo{
	{Name: "DEVICES"},
	{Name: "KV_pipelines_shard_1_leader_mem", InMemory: true},
	{Name: "KV_group_x"},
}

func TestBackedUpStreamsLeavesOutMemoryStreams(t *testing.T) {
	got := BackedUpStreams(withLeaderInMemory)
	if len(got) != 2 || got[0].Name != "DEVICES" || got[1].Name != "KV_group_x" {
		t.Fatalf("backed up %v", got)
	}
	if withLeaderInMemory[1].Storage() != "memory" || withLeaderInMemory[0].Storage() != "file" {
		t.Fatal("storage shown by ls")
	}
}

func stubScale(t *testing.T, streams []NatsStreamInfo, runAfter NatsBackupRun) *int {
	saved := []any{natsScaleListStreams, natsScaleTriggerBackup, natsScaleListRuns}
	t.Cleanup(func() {
		natsScaleListStreams = saved[0].(func(*pt.PlatformData, *pt.DockerClient) ([]NatsStreamInfo, error))
		natsScaleTriggerBackup = saved[1].(func(*pt.PlatformData, *pt.DockerClient) (string, error))
		natsScaleListRuns = saved[2].(func(*pt.PlatformData, *pt.DockerClient) ([]NatsBackupRun, error))
	})
	triggered := 0
	natsScaleListStreams = func(*pt.PlatformData, *pt.DockerClient) ([]NatsStreamInfo, error) { return streams, nil }
	natsScaleTriggerBackup = func(*pt.PlatformData, *pt.DockerClient) (string, error) {
		triggered++
		return "ok", nil
	}
	natsScaleListRuns = func(*pt.PlatformData, *pt.DockerClient) ([]NatsBackupRun, error) {
		if triggered == 0 {
			return []NatsBackupRun{{Name: "20261105T000000Z", Streams: 2}}, nil
		}
		return []NatsBackupRun{runAfter, {Name: "20261105T000000Z", Streams: 2}}, nil
	}
	return &triggered
}

func TestScaleBackupDoesNotCountMemoryStreams(t *testing.T) {
	// The run holds the 2 streams in disk: complete, although NATS has 3.
	stubScale(t, withLeaderInMemory, NatsBackupRun{Name: "20261106T080000Z", Streams: 2})
	run, err := backupNatsStreamsForScale(nil, nil)
	if err != nil {
		t.Fatalf("the scale must go on: %v", err)
	}
	if run != "20261106T080000Z" {
		t.Fatalf("run %q", run)
	}
}

func TestScaleBackupStillRefusesAnIncompleteRun(t *testing.T) {
	stubScale(t, withLeaderInMemory, NatsBackupRun{Name: "20261106T080000Z", Streams: 1})
	_, err := backupNatsStreamsForScale(nil, nil)
	if err == nil || !strings.Contains(err.Error(), "holds 1 of the 2 streams") {
		t.Fatalf("got %v", err)
	}
}

func TestScaleBackupWithOnlyMemoryStreamsHasNothingToCarry(t *testing.T) {
	triggered := stubScale(t, withLeaderInMemory[1:2], NatsBackupRun{})
	run, err := backupNatsStreamsForScale(nil, nil)
	if err != nil || run != "" || *triggered != 0 {
		t.Fatalf("run %q, err %v, backups %d", run, err, *triggered)
	}
}

func TestInitialNatsBackupWaitsForStreamsInDisk(t *testing.T) {
	// pipelines creates its leases in memory first: that alone is nothing
	// to back up, so the wait goes on until a stream in disk appears.
	onlyMemory := []NatsStreamInfo{{Name: "KV_pipelines_shard_1_leader_mem", InMemory: true}}
	f := &fakeInitial{streams: [][]NatsStreamInfo{onlyMemory, onlyMemory, withLeaderInMemory}}
	f.install(t)
	n, err := waitForNatsStreams(nil, nil, initialNatsStreamsWait)
	if err != nil || n != 2 {
		t.Fatalf("count %d, err %v", n, err)
	}
}
