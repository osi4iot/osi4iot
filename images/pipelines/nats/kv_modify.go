package nats

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/nats-io/nats.go/jetstream"
)

// ModifyFunc computes the next value of a key from its current one (nil if
// the key does not exist). write=false leaves the key as it is; write=true
// with next=nil deletes it. It may be called several times (once per
// attempt), so it must not have side effects other than setting the
// caller's variables.
type ModifyFunc func(current []byte) (next []byte, write bool, err error)

// ErrModifyConflict is returned when the key kept changing under every
// attempt (too many writers at once).
var ErrModifyConflict = errors.New("the key changed during every attempt")

const modifyAttempts = 25

// ModifyKV is an atomic read-modify-write of a key: the value is written only
// if nobody changed the key since it was read (its revision), otherwise it
// is read again and fn computed again. Pipelines run several replicas that
// share the digital twin's KV, so the stateful nodes (Deadband, Window,
// Join) update their state with this, never with a plain Put.
// Returns the value that was written (the current one if write=false).
func ModifyKV(ctx context.Context, kv jetstream.KeyValue, key string, fn ModifyFunc) ([]byte, error) {
	delay := 2 * time.Millisecond
	for attempt := 0; attempt < modifyAttempts; attempt++ {
		var current []byte
		var revision uint64
		entry, err := kv.Get(ctx, key)
		switch {
		case err == nil:
			current = entry.Value()
			revision = entry.Revision()
		case errors.Is(err, jetstream.ErrKeyNotFound):
			// missing or deleted: created below
		default:
			return nil, fmt.Errorf("reading %s: %w", key, err)
		}

		next, write, err := fn(current)
		if err != nil {
			return nil, err
		}
		if !write {
			return current, nil
		}

		switch {
		case next == nil && current == nil:
			return nil, nil
		case next == nil:
			err = kv.Delete(ctx, key, jetstream.LastRevision(revision))
		case current == nil:
			// Create fails if someone created it meanwhile (it also works
			// over a deleted key's tombstone)
			_, err = kv.Create(ctx, key, next)
		default:
			_, err = kv.Update(ctx, key, next, revision)
		}
		if err == nil {
			return next, nil
		}
		if !isRevisionConflict(err) {
			return nil, fmt.Errorf("writing %s: %w", key, err)
		}

		// Someone else wrote first: back off with jitter and try again
		wait := delay/2 + time.Duration(rand.Int63n(int64(delay)))
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		if delay < 100*time.Millisecond {
			delay *= 2
		}
	}
	return nil, fmt.Errorf("%s: %w", key, ErrModifyConflict)
}

// isRevisionConflict says whether a write failed because the key changed
// (wrong last sequence) or was created meanwhile.
func isRevisionConflict(err error) bool {
	if errors.Is(err, jetstream.ErrKeyExists) {
		return true
	}
	var apiErr *jetstream.APIError
	if errors.As(err, &apiErr) && apiErr.ErrorCode == jetstream.JSErrCodeStreamWrongLastSequence {
		return true
	}
	return false
}

// Modify is ModifyKV on this store.
func (kvs *KVStore) Modify(ctx context.Context, key string, fn ModifyFunc) ([]byte, error) {
	return ModifyKV(ctx, kvs.natsKv, key, fn)
}
