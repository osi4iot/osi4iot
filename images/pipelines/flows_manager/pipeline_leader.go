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

type PipelineLeaderElector struct {
	log        *logger.Logger
	kv         jetstream.KeyValue
	instanceID string
	lockKey    string
	ttl        time.Duration
	cancel     context.CancelFunc
	random     *rand.Rand

	isLeader atomic.Bool
	rev      atomic.Uint64
	epoch    atomic.Uint64

	lastValidatedAt atomic.Int64
	
	// Nuevos campos para control de adquisición
	acquisitionMu    sync.Mutex
}

func NewPipelineLeaderElector(fm *FlowsManager, orgHash, digitalTwinUid string, ttl time.Duration) (*PipelineLeaderElector, error) {
	lockKey := fmt.Sprintf("org_%s-pipeline_%s-leader", orgHash, digitalTwinUid)
	kv := fm.GetLeaderKvStore()

	replicaIndex := fm.GetReplicaIndex()
	s1 := rand.NewSource(time.Now().UnixNano() * int64(replicaIndex))
	r1 := rand.New(s1)

	le := &PipelineLeaderElector{
		log:        fm.log,
		kv:         kv,
		instanceID: fmt.Sprintf("pipelines_shard_%d_replica_%d-dt_%s", fm.ShardIndex, fm.ReplicaIndex, digitalTwinUid),
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

	// Intento inicial
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

	// Heartbeat para renovar lease
	go le.heartbeatLoop(ctx)

	// Split-brain detection
	go le.splitBrainDetectionLoop(ctx)
	
	// **NUEVO**: Loop activo de adquisición cuando no somos líderes
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
		if v.ID != le.instanceID {
			if le.isLeader.Load() {
				le.log.Warnf("Lost leadership to [%s] (epoch=%d)", v.ID, v.Epoch)
			}
			le.isLeader.Store(false)
			// Trigger acquisition loop
			return
		}

		// Nuestro propio PUT: sincronizar estado
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
		// El acquisitionLoop se encargará de reintentar
	}
}

func (le *PipelineLeaderElector) tryBecomeLeader(ctx context.Context) bool {
	// Evitar múltiples intentos simultáneos
	if !le.acquisitionMu.TryLock() {
		return false
	}
	defer le.acquisitionMu.Unlock()
	
	opCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	// Leer lock existente para determinar siguiente epoch
	var nextEpoch uint64 = 1
	if e, err := le.kv.Get(opCtx, le.lockKey); err == nil {
		if v, err2 := lockUnmarshal(e.Value()); err2 == nil {
			// Verificar si el lease expiró
			if time.Now().Before(v.LeaseUntil) {
				// Lock aún válido, no podemos tomarlo
				if v.ID == le.instanceID {
					// Es nuestro lock, sincronizar estado
					le.epoch.Store(v.Epoch)
					le.rev.Store(e.Revision())
					le.isLeader.Store(true)
					le.touchValidatedNow()
					le.log.Infof("Instance [%s] reconfirmed leadership (epoch=%d)", le.instanceID, v.Epoch)
					return true
				}
				// Otro nodo es líder
				return false
			}
			// Lock expirado, incrementar epoch
			nextEpoch = v.Epoch + 1
		}
	}

	// Intentar crear el lock
	val := lockValue{
		ID:         le.instanceID,
		Epoch:      nextEpoch,
		LeaseUntil: time.Now().Add(le.ttl),
	}
	rev, err := le.kv.Create(opCtx, le.lockKey, lockMarshal(val))
	if err == nil {
		le.epoch.Store(nextEpoch)
		le.rev.Store(rev)
		le.isLeader.Store(true)
		le.touchValidatedNow()
		le.log.Infof("Instance [%s] became leader (epoch=%d, rev=%d)", le.instanceID, nextEpoch, rev)
		return true
	}

	// Si ya existe, verificar si es nuestro
	if errors.Is(err, jetstream.ErrKeyExists) {
		if e, err2 := le.kv.Get(opCtx, le.lockKey); err2 == nil {
			if v, err3 := lockUnmarshal(e.Value()); err3 == nil && v.ID == le.instanceID {
				le.epoch.Store(v.Epoch)
				le.rev.Store(e.Revision())
				le.isLeader.Store(true)
				le.touchValidatedNow()
				le.log.Infof("Instance [%s] confirmed leadership (epoch=%d)", le.instanceID, v.Epoch)
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
		ID:         le.instanceID,
		Epoch:      currentEpoch,
		LeaseUntil: time.Now().Add(le.ttl),
	}
	newRev, err := le.kv.Update(opCtx, le.lockKey, lockMarshal(val), currentRev)
	if err != nil {
		le.isLeader.Store(false)
		le.log.Warnf("Failed to renew lock (rev=%d): %v", currentRev, err)
		// El acquisitionLoop se encargará de reintentar
		return
	}
	le.rev.Store(newRev)
	le.touchValidatedNow()
}

// **NUEVO**: Loop activo que intenta adquirir liderazgo cuando no lo tenemos
func (le *PipelineLeaderElector) acquisitionLoop(ctx context.Context) {
	// Intervalo basado en el TTL del lock
	// Intentamos con frecuencia razonable pero sin saturar
	interval := max(le.ttl/4, 500*time.Millisecond)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// Solo intentar si no somos líderes
		if le.isLeader.Load() {
			time.Sleep(interval)
			continue
		}

		// Intentar adquirir
		le.tryBecomeLeader(ctx)

		// Pequeño jitter para evitar thundering herd si hay muchas instancias
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

			// Validación explícita
			opCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			e, err := le.kv.Get(opCtx, le.lockKey)
			cancel()
			if err != nil {
				le.isLeader.Store(false)
				le.log.Warnf("Validation error (Get): %v", err)
				continue
			}

			// Verificar id + epoch
			v, err := lockUnmarshal(e.Value())
			if err != nil || v.ID != le.instanceID || v.Epoch != le.epoch.Load() {
				le.isLeader.Store(false)
				le.log.Warnf("Leadership validation failed (id/epoch mismatch). id=%s kvID=%s epoch(local=%d kv=%d) err=%v",
					le.instanceID, v.ID, le.epoch.Load(), v.Epoch, err)
				continue
			}

			le.touchValidatedNow()
		}
	}
}

func (le *PipelineLeaderElector) IsLeader() bool {
	return le.isLeader.Load()
}

func (le *PipelineLeaderElector) getLeaderInstanceID() (string, bool) {
	if !le.isLeader.Load() {
		// Si no somos líderes, leer del KV quién es
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		
		e, err := le.kv.Get(ctx, le.lockKey)
		if err != nil {
			return "", false
		}
		
		v, err := lockUnmarshal(e.Value())
		if err != nil {
			return "", false
		}
		
		return v.ID, true
	}
	
	return le.instanceID, true
}

// Parsear el instanceID para extraer el replica index
func (le *PipelineLeaderElector) GetReplicaIndexLeader() int {
	leaderID, ok := le.getLeaderInstanceID()
	if !ok {
		return -1
	}
	
	var shardIdx, replicaIdx int
	var dtUID string
	_, err := fmt.Sscanf(leaderID, "pipelines_shard_%d_replica_%d-dt_%s", &shardIdx, &replicaIdx, &dtUID)
	if err != nil {
		return -1
	}
	
	return replicaIdx
}

func (le *PipelineLeaderElector) Stop() {
	if le.cancel == nil {
		return
	}
	le.cancel()

	// Liberar lock gracefully si somos líderes
	if le.IsLeader() {
		opCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		currentRev := le.rev.Load()
		if err := le.kv.Delete(opCtx, le.lockKey, jetstream.LastRevision(currentRev)); err != nil {
			le.log.Warnf("Failed to release lock on stop: %v", err)
		} else {
			le.log.Infof("Instance [%s] released leadership gracefully", le.instanceID)
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