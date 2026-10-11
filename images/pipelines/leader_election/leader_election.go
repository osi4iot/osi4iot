package leader_election

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"pipelines/logger"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/nats-io/nats.go/jetstream"
)

type lockValue struct {
	ID         string    `json:"id"`
	Epoch      uint64    `json:"epoch"`
	LeaseUntil time.Time `json:"leaseUntil"`
}

type LeaderInstanceID struct {
	ReplicaIndex int
	ElemenType   string //group, pipeline, etc
	ElementID    string
}

type LeaderElector struct {
	log        *logger.Logger
	kv         jetstream.KeyValue
	instanceID LeaderInstanceID
	lockKey    string
	ttl        time.Duration
	cancel     context.CancelFunc
	ctx        context.Context
	random     *rand.Rand
	isLeader   atomic.Bool
	rev        atomic.Uint64
	epoch      atomic.Uint64

	lastValidatedAt atomic.Int64

	acquisitionMu sync.Mutex
	wg            sync.WaitGroup
}

func NewLeaderElector(
	replicaIndex int,
	orgHash string,
	elementType string,
	elementID string,
	kv jetstream.KeyValue,
	ttl time.Duration,
	log *logger.Logger,
) (*LeaderElector, error) {
	var lockKey string
	if elementType == "organization" {
		lockKey = fmt.Sprintf("org_%s-leader", orgHash)
	} else {
		lockKey = fmt.Sprintf("org_%s-%s_%s-leader", orgHash, elementType, elementID)
	}
	s1 := rand.NewSource(time.Now().UnixNano() * int64(replicaIndex))
	r1 := rand.New(s1)

	instanceID := LeaderInstanceID{
		ReplicaIndex: replicaIndex,
		ElemenType:   elementType,
		ElementID:    elementID,
	}

	le := &LeaderElector{
		log:        log,
		kv:         kv,
		instanceID: instanceID,
		lockKey:    lockKey,
		ttl:        ttl,
		random:     r1,
	}
	le.isLeader.Store(false)
	le.rev.Store(0)
	return le, nil
}

func (le *LeaderElector) Start(ctx context.Context) error {
	leCtx, leCancel := context.WithCancel(ctx)
	le.cancel = leCancel
	le.ctx = leCtx

	// Initial attempt
	le.tryBecomeLeader(leCtx)

	// Watch the lock key; use leCtx so the watcher is stopped when Stop() is called.
	watcher, err := le.kv.Watch(leCtx, le.lockKey)
	if err != nil {
		leCancel()
		return fmt.Errorf("failed to watch lock key: %w", err)
	}

	le.wg.Add(4)
	go func() {
		defer le.wg.Done()
		defer watcher.Stop()
		for {
			select {
			case <-leCtx.Done():
				return
			case entry := <-watcher.Updates():
				if entry == nil {
					continue
				}
				le.handleWatchUpdate(entry)
			}
		}
	}()

	// Heartbeat to renew lease
	go func() {
		defer le.wg.Done()
		le.heartbeatLoop(leCtx)
	}()

	// Split-brain detection
	go func() {
		defer le.wg.Done()
		le.splitBrainDetectionLoop(leCtx)
	}()

	// Active acquisition loop when we are not leaders
	go func() {
		defer le.wg.Done()
		le.acquisitionLoop(leCtx)
	}()

	return nil
}

func (le *LeaderElector) handleWatchUpdate(entry jetstream.KeyValueEntry) {
	switch entry.Operation() {
	case jetstream.KeyValuePut:
		v, err := lockUnmarshal(entry.Value())
		if err != nil {
			return
		}
		if v.ID != le.instanceID.getString() {
			if le.isLeader.Load() {
				le.log.Warnf("Lost leadership to [%s] (epoch=%d)", v.ID, v.Epoch)
			}
			le.isLeader.Store(false)
			// Trigger acquisition loop
			return
		}

		// Our own PUT: synchronize state
		le.epoch.Store(v.Epoch)
		le.rev.Store(entry.Revision())
		le.isLeader.Store(true)
		le.touchValidatedNow()

	case jetstream.KeyValueDelete, jetstream.KeyValuePurge:
		wasLeader := le.isLeader.Load()
		le.isLeader.Store(false)
		if wasLeader {
			le.log.Warnf("Leadership lost due to %s", entry.Operation())
		}
		// The acquisitionLoop will handle retrying
	}
}

func (le *LeaderElector) tryBecomeLeader(ctx context.Context) bool {
	// Avoid multiple simultaneous attempts
	if !le.acquisitionMu.TryLock() {
		return false
	}
	defer le.acquisitionMu.Unlock()

	opCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	// Read existing lock to determine next epoch
	var nextEpoch uint64 = 1
	if e, err := le.kv.Get(opCtx, le.lockKey); err == nil {
		if v, err2 := lockUnmarshal(e.Value()); err2 == nil {
			// Check if lease expired
			if time.Now().Before(v.LeaseUntil) {
				// Lock still valid, we cannot take it
				if v.ID == le.instanceID.getString() {
					// It's our lock, synchronize state
					le.epoch.Store(v.Epoch)
					le.rev.Store(e.Revision())
					le.isLeader.Store(true)
					le.touchValidatedNow()
					le.log.Infof("Instance [%s] reconfirmed leadership (epoch=%d)", le.instanceID.getString(), v.Epoch)
					return true
				}
				// Another node is leader
				return false
			}
			// Lock expired, increment epoch
			nextEpoch = v.Epoch + 1
		}
	}

	// Try to create the lock
	val := lockValue{
		ID:         le.instanceID.getString(),
		Epoch:      nextEpoch,
		LeaseUntil: time.Now().Add(le.ttl),
	}
	rev, err := le.kv.Create(opCtx, le.lockKey, lockMarshal(val))
	if err == nil {
		le.epoch.Store(nextEpoch)
		le.rev.Store(rev)
		le.isLeader.Store(true)
		le.touchValidatedNow()
		le.log.Infof("Instance [%s] became leader (epoch=%d, rev=%d)", le.instanceID.getString(), nextEpoch, rev)
		return true
	}

	// If exists, check if it's ours
	if errors.Is(err, jetstream.ErrKeyExists) {
		if e, err2 := le.kv.Get(opCtx, le.lockKey); err2 == nil {
			if v, err3 := lockUnmarshal(e.Value()); err3 == nil && v.ID == le.instanceID.getString() {
				le.epoch.Store(v.Epoch)
				le.rev.Store(e.Revision())
				le.isLeader.Store(true)
				le.touchValidatedNow()
				le.log.Infof("Instance [%s] confirmed leadership (epoch=%d)", le.instanceID.getString(), v.Epoch)
				return true
			}
		}
	}

	return false
}

func (le *LeaderElector) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(max(le.ttl/3, 100*time.Millisecond))
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !le.isLeader.Load() {
				continue
			}
			le.renewLock(ctx)
		}
	}
}

func (le *LeaderElector) renewLock(ctx context.Context) {
	currentRev := le.rev.Load()
	currentEpoch := le.epoch.Load()
	opCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	val := lockValue{
		ID:         le.instanceID.getString(),
		Epoch:      currentEpoch,
		LeaseUntil: time.Now().Add(le.ttl),
	}
	newRev, err := le.kv.Update(opCtx, le.lockKey, lockMarshal(val), currentRev)
	if err != nil {
		le.isLeader.Store(false)
		le.log.Warnf("Failed to renew lock (rev=%d): %v", currentRev, err)
		// The acquisitionLoop will handle retrying
		return
	}
	le.rev.Store(newRev)
	le.touchValidatedNow()
}

// Active loop that tries to acquire leadership when we don't have it
func (le *LeaderElector) acquisitionLoop(ctx context.Context) {
	// Interval based on the lock TTL
	// We try at a reasonable frequency but without saturating
	interval := max(le.ttl/4, 500*time.Millisecond)

	for {
		// Small jitter to avoid thundering herd if there are many instances
		jitter := time.Duration(le.random.Int63n(int64(interval / 10)))
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval + jitter):
		}

		// Only try if we are not leaders
		if le.isLeader.Load() {
			continue
		}

		le.tryBecomeLeader(ctx)
	}
}

func (le *LeaderElector) splitBrainDetectionLoop(ctx context.Context) {
	ticker := time.NewTicker(max(le.ttl/2, 200*time.Millisecond))
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case <-ticker.C:
			if !le.isLeader.Load() {
				continue
			}

			// Demotion por staleness
			if time.Since(time.Unix(0, le.lastValidatedAt.Load())) > 2*le.ttl {
				le.isLeader.Store(false)
				le.log.Warnf("Demoting leader due to staleness (age > 2*ttl)")
				continue
			}

			// Explicit validation
			opCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			e, err := le.kv.Get(opCtx, le.lockKey)
			cancel()
			if err != nil {
				le.isLeader.Store(false)
				le.log.Warnf("Validation error (Get): %v", err)
				continue
			}

			// Verify id + epoch
			v, err := lockUnmarshal(e.Value())
			if err != nil || v.ID != le.instanceID.getString() || v.Epoch != le.epoch.Load() {
				le.isLeader.Store(false)
				le.log.Warnf("Leadership validation failed (id/epoch mismatch). id=%s kvID=%s epoch(local=%d kv=%d) err=%v",
					le.instanceID.getString(), v.ID, le.epoch.Load(), v.Epoch, err)
				continue
			}

			le.touchValidatedNow()
		}
	}
}

func (le *LeaderElector) IsLeader() bool {
	return le.isLeader.Load()
}

func (le *LeaderElector) getLeaderInstanceID(ctx context.Context) (LeaderInstanceID, bool) {
	if !le.isLeader.Load() {
		// If we are not leaders, read from KV who is.
		ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()

		e, err := le.kv.Get(ctx, le.lockKey)
		if err != nil {
			return LeaderInstanceID{}, false
		}

		v, err := lockUnmarshal(e.Value())
		if err != nil {
			return LeaderInstanceID{}, false
		}

		instanceId, err := getLeaderInstanceIdFromString(v.ID)
		if err != nil {
			return LeaderInstanceID{}, false
		}

		return instanceId, true
	}

	return le.instanceID, true
}

// Parse the instanceID to extract the replica index
func (le *LeaderElector) GetReplicaIndexLeader(ctx context.Context) int {
	leaderID, ok := le.getLeaderInstanceID(ctx)
	if !ok {
		return -1
	}

	return leaderID.ReplicaIndex
}

func (le *LeaderElector) Stop(ctx context.Context) {
	if le.cancel == nil {
		return
	}
	le.cancel()

	// Wait for all goroutines to finish before checking IsLeader(),
	// eliminating the race that existed with the old time.Sleep(100ms).
	le.wg.Wait()

	if le.IsLeader() {
		// le.ctx is already cancelled at this point; use a fresh background context
		// with a short timeout so the delete is not blocked indefinitely.
		opCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()

		currentRev := le.rev.Load()
		err := le.kv.Delete(opCtx, le.lockKey, jetstream.LastRevision(currentRev))

		if err != nil && strings.Contains(err.Error(), "wrong last sequence") {
			// Fallback: unconditional delete
			le.log.Warn("Conditional delete failed, attempting unconditional delete")
			if err := le.kv.Delete(opCtx, le.lockKey); err != nil {
				le.log.Warnf("Unconditional delete also failed: %v", err)
			}
		} else if err != nil {
			le.log.Warnf("Failed to release lock on stop: %v", err)
		} else {
			le.log.Infof("Instance [%s] released leadership gracefully", le.instanceID.getString())
		}
	}
}

func (le *LeaderElector) GetRevision() uint64 {
	return le.rev.Load()
}

func (le *LeaderElector) touchValidatedNow() {
	le.lastValidatedAt.Store(time.Now().UnixNano())
}

func (le *LeaderElector) lastValidatedAge() time.Duration {
	t := time.Unix(0, le.lastValidatedAt.Load())
	return time.Since(t)
}

func (le *LeaderElector) IsLeaderFresh(maxAge time.Duration) bool {
	if !le.IsLeader() {
		return false
	}
	return le.lastValidatedAge() <= maxAge
}

func lockMarshal(v lockValue) []byte {
	b, _ := json.Marshal(v)
	return b
}

func lockUnmarshal(b []byte) (lockValue, error) {
	var v lockValue
	return v, json.Unmarshal(b, &v)
}

func (li *LeaderInstanceID) getString() (leaderID string) {
	return fmt.Sprintf("pipelines_replica_%d-%s_%s", li.ReplicaIndex, li.ElemenType, li.ElementID)
}

func getLeaderInstanceIdFromString(leaderID string) (instanceID LeaderInstanceID, err error) {
	_, err = fmt.Sscanf(leaderID, "pipelines_replica_%d-%s_%s", &instanceID.ReplicaIndex, &instanceID.ElemenType, &instanceID.ElementID)
	return instanceID, err
}
