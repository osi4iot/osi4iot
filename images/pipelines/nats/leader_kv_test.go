package nats

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"pipelines/logger"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// TestLeaderKeyValueStoreInMemory runs on a real NATS server with JetStream
// when NATS_TEST_URL is set (e.g. nats://127.0.0.1:4222).
func TestLeaderKeyValueStoreInMemory(t *testing.T) {
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
	const shard = 7
	// the bucket of the previous versions, in disk, with a leader in it
	legacy, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{Bucket: "pipelines_shard_7_leader", TTL: 10 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Put(ctx, "org_x.pipeline.dt", []byte("old leader")); err != nil {
		t.Fatal(err)
	}

	kv, err := CreateLeaderKeyValueStore(ctx, shard, 2*time.Second, logger.NewLogger(), js, 1)
	if err != nil {
		t.Fatal(err)
	}
	defer js.DeleteKeyValue(ctx, LeaderKeyValueStoreName(shard))

	status, err := kv.natsKv.Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	info := status.(*jetstream.KeyValueBucketStatus).StreamInfo()
	if info.Config.Storage != jetstream.MemoryStorage || info.Config.MaxAge != 2*time.Second {
		t.Fatalf("storage %v, ttl %v", info.Config.Storage, info.Config.MaxAge)
	}
	if _, err := js.KeyValue(ctx, "pipelines_shard_7_leader"); !errors.Is(err, jetstream.ErrBucketNotFound) {
		t.Fatalf("the former bucket must be deleted, got %v", err)
	}
	// the old replica's renewal fails: it stops leading
	if _, err := legacy.Update(ctx, "org_x.pipeline.dt", []byte("renew"), 1); err == nil {
		t.Fatal("a renewal on the deleted bucket must fail")
	}

	// the leases still expire by themselves
	if _, err := kv.natsKv.Create(ctx, "lease", []byte("me")); err != nil {
		t.Fatal(err)
	}
	time.Sleep(2500 * time.Millisecond)
	if _, err := kv.natsKv.Get(ctx, "lease"); !errors.Is(err, jetstream.ErrKeyNotFound) {
		t.Fatalf("the lease must expire, got %v", err)
	}

	// a second replica starting finds it (and nothing to delete)
	if _, err := CreateLeaderKeyValueStore(ctx, shard, 2*time.Second, logger.NewLogger(), js, 1); err != nil {
		t.Fatal(err)
	}
}
