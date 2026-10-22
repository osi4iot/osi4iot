package leader_election

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/nats-io/nats.go/jetstream"

	"pipelines/logger"
)

// memKV is an in-memory jetstream.KeyValue with the semantics the
// elector relies on: Create fails on an existing key, Update and
// Delete(LastRevision) check the revision, and watchers see every change.
type memKV struct {
	jetstream.KeyValue // methods the elector does not use

	mu       sync.Mutex
	rev      uint64
	entries  map[string]*memEntry
	watchers []chan jetstream.KeyValueEntry
}

type memEntry struct {
	key   string
	value []byte
	rev   uint64
	op    jetstream.KeyValueOp
}

func (e *memEntry) Key() string                     { return e.key }
func (e *memEntry) Value() []byte                   { return e.value }
func (e *memEntry) Revision() uint64                { return e.rev }
func (e *memEntry) Operation() jetstream.KeyValueOp { return e.op }
func (e *memEntry) Bucket() string                  { return "test" }
func (e *memEntry) Created() time.Time              { return time.Time{} }
func (e *memEntry) Delta() uint64                   { return 0 }

func newMemKV() *memKV { return &memKV{entries: map[string]*memEntry{}} }

func (kv *memKV) notify(e *memEntry) {
	for _, w := range kv.watchers {
		select {
		case w <- e:
		default:
		}
	}
}

func (kv *memKV) Get(_ context.Context, key string) (jetstream.KeyValueEntry, error) {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	e, ok := kv.entries[key]
	if !ok {
		return nil, jetstream.ErrKeyNotFound
	}
	return e, nil
}

func (kv *memKV) Create(_ context.Context, key string, value []byte, _ ...jetstream.KVCreateOpt) (uint64, error) {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	if _, ok := kv.entries[key]; ok {
		return 0, jetstream.ErrKeyExists
	}
	kv.rev++
	e := &memEntry{key: key, value: value, rev: kv.rev, op: jetstream.KeyValuePut}
	kv.entries[key] = e
	kv.notify(e)
	return kv.rev, nil
}

func (kv *memKV) Update(_ context.Context, key string, value []byte, revision uint64) (uint64, error) {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	cur, ok := kv.entries[key]
	if !ok || cur.rev != revision {
		return 0, jetstream.ErrKeyExists
	}
	kv.rev++
	e := &memEntry{key: key, value: value, rev: kv.rev, op: jetstream.KeyValuePut}
	kv.entries[key] = e
	kv.notify(e)
	return kv.rev, nil
}

// Delete is unconditional: the revision in LastRevision is not readable
// from outside jetstream.
func (kv *memKV) Delete(_ context.Context, key string, _ ...jetstream.KVDeleteOpt) error {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	if _, ok := kv.entries[key]; !ok {
		return jetstream.ErrKeyNotFound
	}
	delete(kv.entries, key)
	kv.rev++
	kv.notify(&memEntry{key: key, rev: kv.rev, op: jetstream.KeyValueDelete})
	return nil
}

func (kv *memKV) Watch(_ context.Context, _ string, _ ...jetstream.WatchOpt) (jetstream.KeyWatcher, error) {
	kv.mu.Lock()
	defer kv.mu.Unlock()
	ch := make(chan jetstream.KeyValueEntry, 64)
	kv.watchers = append(kv.watchers, ch)
	return &memWatcher{ch: ch}, nil
}

type memWatcher struct {
	jetstream.KeyWatcher
	ch chan jetstream.KeyValueEntry
}

func (w *memWatcher) Updates() <-chan jetstream.KeyValueEntry { return w.ch }
func (w *memWatcher) Stop() error                             { return nil }

func newTestElector(t *testing.T, kv jetstream.KeyValue, process string) *LeaderElector {
	t.Helper()
	le, err := NewLeaderElector(1, "org", "pipeline", "dt1", kv, 400*time.Millisecond, logger.NewLogger())
	if err != nil {
		t.Fatal(err)
	}
	le.process = process
	return le
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

// Two tasks of the same replica (same replica index, different
// processes), as during a Swarm rolling update: only one may lead, and
// the other takes over when the first one stops.
func TestSameReplicaDifferentProcess(t *testing.T) {
	kv := newMemKV()
	ctx := context.Background()

	oldTask := newTestElector(t, kv, "old-container")
	if err := oldTask.Start(ctx); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the old task to lead", oldTask.IsLeader)

	newTask := newTestElector(t, kv, "new-container")
	if err := newTask.Start(ctx); err != nil {
		t.Fatal(err)
	}
	// Several acquisition and renewal rounds: the new task must not
	// take the old task's lock as its own.
	for i := 0; i < 10; i++ {
		time.Sleep(100 * time.Millisecond)
		if newTask.IsLeader() {
			t.Fatal("the new task took the lock of the old one (same replica index)")
		}
		if !oldTask.IsLeader() {
			t.Fatal("the old task lost the lock while still running")
		}
	}

	oldTask.Stop(ctx)
	waitFor(t, "the new task to take over", newTask.IsLeader)
	newTask.Stop(ctx)
}
