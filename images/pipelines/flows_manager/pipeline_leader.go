package flows_manager

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"pipelines/logger"
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
	ShardIndex     int
	ReplicaIndex   int
	DigitalTwinUID string
}

type PipelineLeaderElector struct {
	log        *logger.Logger
	kv         jetstream.KeyValue
	instanceID LeaderInstanceID
	lockKey    string
	ttl        time.Duration
	cancel     context.CancelFunc
	random     *rand.Rand

	isLeader atomic.Bool
	rev      atomic.Uint64
	epoch    atomic.Uint64

	lastValidatedAt atomic.Int64

	acquisitionMu sync.Mutex
}

func NewPipelineLeaderElector(fm *FlowsManager, orgHash, digitalTwinUid string, ttl time.Duration) (*PipelineLeaderElector, error) {
	lockKey := fmt.Sprintf("org_%s-pipeline_%s-leader", orgHash, digitalTwinUid)
	kv := fm.GetLeaderKvStore()

	replicaIndex := fm.GetReplicaIndex()
	s1 := rand.NewSource(time.Now().UnixNano() * int64(replicaIndex))
	r1 := rand.New(s1)

	instanceID := LeaderInstanceID{
		ShardIndex:     fm.ShardIndex,
		ReplicaIndex:   fm.ReplicaIndex,
		DigitalTwinUID: digitalTwinUid,
	}

	le := &PipelineLeaderElector{
		log:        fm.log,
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

func (le *PipelineLeaderElector) Start() error {
	ctx, cancel := context.WithCancel(context.Background())
	le.cancel = cancel

	// Initial attempt
	le.tryBecomeLeader(ctx)

	// Watch del lock
	watcher, err := le.kv.Watch(ctx, le.lockKey)
	if err != nil {
		cancel()
		return fmt.Errorf("failed to watch lock key: %w", err)
	}

	go func() {
		defer watcher.Stop()
		for {
			select {
			case <-ctx.Done():
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
	go le.heartbeatLoop(ctx)

	// Split-brain detection
	go le.splitBrainDetectionLoop(ctx)

	// Active acquisition loop when we are not leaders
	go le.acquisitionLoop(ctx)

	return nil
}

func (le *PipelineLeaderElector) handleWatchUpdate(entry jetstream.KeyValueEntry) {
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

func (le *PipelineLeaderElector) tryBecomeLeader(ctx context.Context) bool {
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

func (le *PipelineLeaderElector) heartbeatLoop(ctx context.Context) {
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

func (le *PipelineLeaderElector) renewLock(ctx context.Context) {
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
func (le *PipelineLeaderElector) acquisitionLoop(ctx context.Context) {
	// Interval based on the lock TTL
	// We try at a reasonable frequency but without saturating
	interval := max(le.ttl/4, 500*time.Millisecond)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// Only try if we are not leaders
		if le.isLeader.Load() {
			time.Sleep(interval)
			continue
		}

		// Try to acquire
		le.tryBecomeLeader(ctx)

		// Small jitter to avoid thundering herd if there are many instances
		jitter := time.Duration(le.random.Int63n(int64(interval / 10)))
		time.Sleep(interval + jitter)
	}
}

func (le *PipelineLeaderElector) splitBrainDetectionLoop(ctx context.Context) {
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

func (le *PipelineLeaderElector) IsLeader() bool {
	return le.isLeader.Load()
}

func (le *PipelineLeaderElector) getLeaderInstanceID() (LeaderInstanceID, bool) {
	if !le.isLeader.Load() {
		// If we are not leaders, read from KV who is
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
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
func (le *PipelineLeaderElector) GetReplicaIndexLeader() int {
	leaderID, ok := le.getLeaderInstanceID()
	if !ok {
		return -1
	}

	return leaderID.ReplicaIndex
}

func (le *PipelineLeaderElector) Stop() {
	if le.cancel == nil {
		return
	}
	le.cancel()

	// Release lock gracefully if we are leaders
	if le.IsLeader() {
		opCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		currentRev := le.rev.Load()
		if err := le.kv.Delete(opCtx, le.lockKey, jetstream.LastRevision(currentRev)); err != nil {
			le.log.Warnf("Failed to release lock on stop: %v", err)
		} else {
			le.log.Infof("Instance [%s] released leadership gracefully", le.instanceID.getString())
		}
	}
}

func (le *PipelineLeaderElector) GetRevision() uint64 {
	return le.rev.Load()
}

func (le *PipelineLeaderElector) touchValidatedNow() {
	le.lastValidatedAt.Store(time.Now().UnixNano())
}

func (le *PipelineLeaderElector) lastValidatedAge() time.Duration {
	t := time.Unix(0, le.lastValidatedAt.Load())
	return time.Since(t)
}

func (le *PipelineLeaderElector) IsLeaderFresh(maxAge time.Duration) bool {
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
	return fmt.Sprintf("pipelines_shard_%d_replica_%d-dt_%s", li.ShardIndex, li.ReplicaIndex, li.DigitalTwinUID)
}

func getLeaderInstanceIdFromString(leaderID string) (instanceID LeaderInstanceID, err error) {
	_, err = fmt.Sscanf(leaderID, "pipelines_shard_%d_replica_%d-dt_%s", &instanceID.ShardIndex, &instanceID.ReplicaIndex, &instanceID.DigitalTwinUID)
	return instanceID, err
}
