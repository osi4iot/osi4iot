package nats_backup

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/nats-io/jsm.go"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// TestStreamsToBackUpSkipsMemoryStreams runs on a real NATS server with
// JetStream when NATS_TEST_URL is set (e.g. nats://127.0.0.1:4222): a KV in
// memory, like pipelines' leases, made every backup run fail with "memory
// streams do not support snapshots".
func TestStreamsToBackUpSkipsMemoryStreams(t *testing.T) {
	url := os.Getenv("NATS_TEST_URL")
	if url == "" {
		t.Skip("NATS_TEST_URL not set")
	}
	nc, err := nats.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer nc.Close()
	js, err := jetstream.New(nc)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	disk, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{Bucket: "backup_test_disk"})
	if err != nil {
		t.Fatal(err)
	}
	defer js.DeleteKeyValue(ctx, "backup_test_disk")
	memory, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket: "backup_test_leader_mem", TTL: time.Minute, Storage: jetstream.MemoryStorage,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer js.DeleteKeyValue(ctx, "backup_test_leader_mem")
	if _, err := disk.Put(ctx, "k", []byte("v")); err != nil {
		t.Fatal(err)
	}
	if _, err := memory.Put(ctx, "lease", []byte("me")); err != nil {
		t.Fatal(err)
	}

	mgr, err := jsm.New(nc)
	if err != nil {
		t.Fatal(err)
	}
	all, _, _, err := mgr.Streams(nil)
	if err != nil {
		t.Fatal(err)
	}
	streams, inMemory := streamsToBackUp(all)

	if len(inMemory) != 1 || inMemory[0] != "KV_backup_test_leader_mem" {
		t.Fatalf("skipped %v, want [KV_backup_test_leader_mem]", inMemory)
	}
	found := false
	for _, s := range streams {
		if s.Name() == "KV_backup_test_leader_mem" {
			t.Fatal("the memory stream must not be backed up")
		}
		if s.Name() == "KV_backup_test_disk" {
			found = true
		}
		// what Run does with each one: none fails now
		snapCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		_, err := s.SnapshotToDirectory(snapCtx, t.TempDir(), jsm.SnapshotConsumers())
		cancel()
		if err != nil {
			t.Fatalf("%s: snapshotting: %v", s.Name(), err)
		}
	}
	if !found {
		t.Fatal("the disk stream must be backed up")
	}

	// and the memory stream, as before, cannot be snapshotted
	mem, err := mgr.LoadStream("KV_backup_test_leader_mem")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mem.SnapshotToDirectory(ctx, t.TempDir()); err == nil {
		t.Fatal("expected NATS to refuse the snapshot of a memory stream")
	}
}
