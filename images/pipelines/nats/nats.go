package nats

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"pipelines/config"
	"pipelines/logger"
	"strconv"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type KVStore struct {
	kv     jetstream.KeyValue
	logger *logger.Logger
}

func Connect(cfg *config.Config, log *logger.Logger) (*nats.Conn, error) {
	nc, err := nats.Connect(
		strings.Join(cfg.NATS.ServersUrl, ","),
		nats.UserInfo(cfg.NATS.Username, cfg.NATS.Password),
	)
	if err != nil {
		log.Errorf("Error connecting to NATS: %v", err)
		return nil, err
	}
	log.Info("Connected to NATS")
	return nc, nil
}

func JetStreamConnect(nc *nats.Conn, log *logger.Logger) (jetstream.JetStream, error) {
	js, err := jetstream.New(nc)
	if err != nil {
		log.Errorf("Error getting JetStream context: %v", err)
		return nil, err
	}
	log.Info("JetStream instance created successfully")
	return js, nil
}

func CreateStream(
	shardIndex int,
	numStreamReplicas int,
	log *logger.Logger,
	js jetstream.JetStream,
) (jetstream.Stream, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	streamName := strings.ToUpper(fmt.Sprintf("PIPELINES_SHARD_%d", shardIndex))
	subject1 := fmt.Sprintf("pipelines_shard_%d.admin", shardIndex)
	subject2 := fmt.Sprintf("pipelines_shard_%d.admin.>", shardIndex)
	stream, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      streamName,
		Subjects:  []string{subject1, subject2},
		Storage:   jetstream.FileStorage,
		Replicas:  numStreamReplicas,
		Retention: jetstream.LimitsPolicy,
		MaxAge:    1 * time.Hour, // Retain messages for 1 hour
	})

	if err != nil {
		log.Errorf("Error creating stream '%s': %v", streamName, err)
		return nil, err
	}

	log.Infof("Stream '%s' created successfully", streamName)
	log.Infof("Stream subjects: '%s' and '%s'", subject1, subject2)
	return stream, nil
}

func CreateConsumer(
	shardIndex int,
	replicaIndex int,
	log *logger.Logger,
	stream jetstream.Stream,
) (jetstream.Consumer, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	consumerName := fmt.Sprintf("pipelines_shard_%d_replica_%d", shardIndex, replicaIndex)

	consumer, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Name:              consumerName,
		Durable:           consumerName,
		DeliverPolicy:     jetstream.DeliverAllPolicy,
		AckPolicy:         jetstream.AckExplicitPolicy,
		MaxDeliver:        3,
		AckWait:           10 * time.Second,
		MaxWaiting:        100,
		MaxAckPending:     1000,
		FilterSubject:     fmt.Sprintf("pipelines_shard_%d.admin", shardIndex),
		ReplayPolicy:      jetstream.ReplayInstantPolicy,
		MaxRequestBatch:   500,
		MaxRequestExpires: 30 * time.Second,
	})

	if err != nil {
		log.Errorf("Error creating consumer '%s': %v", consumerName, err)
		return nil, err
	}

	log.Infof("Consumer '%s' created successfully", consumerName)
	return consumer, nil
}

func CreateDigitalTwinKeyValueStore(
	orgHash string,
	digitalTwinUID string,
	log *logger.Logger,
	js jetstream.JetStream,
) (*KVStore, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	kvName := fmt.Sprintf("org_%s-dt_%s", orgHash, digitalTwinUID)
	kv, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket: kvName,
	})

	if err != nil {
		log.Errorf("Error creating KV store '%s': %v", kvName, err)
		return nil, err
	}

	newKvStore := NewKVStore(kv, log)

	log.Infof("KV store '%s' created successfully", kvName)
	return newKvStore, nil
}

func DeleteDigitalTwinKeyValueStore(
	orgHash string,
	digitalTwinUID string,
	log *logger.Logger,
	js jetstream.JetStream,
) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	kvName := fmt.Sprintf("org_%s-dt_%s", orgHash, digitalTwinUID)
	err := js.DeleteKeyValue(ctx, kvName)

	if err != nil {
		log.Errorf("Error deleting KV store '%s': %v", kvName, err)
		return err
	}

	log.Infof("KV store '%s' deleted successfully", kvName)
	return nil
}

// NewKVStore creates a new KVStore instance with the provided KeyValue and logger
func NewKVStore(kv jetstream.KeyValue, log *logger.Logger) *KVStore {
	return &KVStore{
		kv:     kv,
		logger: log,
	}
}

// GetValue retrieves and unmarshals a value from the store into the provided destination
func (kvs *KVStore) GetValue(ctx context.Context, key string, dest interface{}) error {
	if dest == nil {
		return errors.New("destination cannot be nil")
	}

	entry, err := kvs.kv.Get(ctx, key)
	if err != nil {
		if err == jetstream.ErrKeyNotFound {
			return fmt.Errorf("key %s not found", key)
		}
		kvs.logger.Errorf("Failed to get key %s: %v", key, err)
		return err
	}

	if err := json.Unmarshal(entry.Value(), dest); err != nil {
		kvs.logger.Errorf("Failed to unmarshal data for key %s: %v", key, err)
		return fmt.Errorf("failed to unmarshal data: %w", err)
	}

	return nil
}

// GetStringValue retrieves a string value from the store
func (kvs *KVStore) GetStringValue(ctx context.Context, key string) (string, error) {
	var result string
	err := kvs.GetValue(ctx, key, &result)
	return result, err
}

// GetNumberValue retrieves a numeric value from the store as float64
func (kvs *KVStore) GetNumberValue(ctx context.Context, key string) (float64, error) {
	var result float64
	err := kvs.GetValue(ctx, key, &result)
	return result, err
}

// GetIntValue retrieves an integer value from the store
func (kvs *KVStore) GetIntValue(ctx context.Context, key string) (int64, error) {
	var result int64
	err := kvs.GetValue(ctx, key, &result)
	return result, err
}

// GetBoolValue retrieves a boolean value from the store
func (kvs *KVStore) GetBoolValue(ctx context.Context, key string) (bool, error) {
	var result bool
	err := kvs.GetValue(ctx, key, &result)
	return result, err
}

// GetObjectValue retrieves an object value from the store as map[string]any
func (kvs *KVStore) GetObjectValue(ctx context.Context, key string) (map[string]any, error) {
	var result map[string]any
	err := kvs.GetValue(ctx, key, &result)
	return result, err
}

// GetArrayValue retrieves an array value from the store as []any
func (kvs *KVStore) GetArrayValue(ctx context.Context, key string) ([]any, error) {
	var result []any
	err := kvs.GetValue(ctx, key, &result)
	return result, err
}

// GetRawValue retrieves the raw bytes from the store
func (kvs *KVStore) GetRawValue(ctx context.Context, key string) ([]byte, error) {
	entry, err := kvs.kv.Get(ctx, key)
	if err != nil {
		if err == jetstream.ErrKeyNotFound {
			return nil, fmt.Errorf("key %s not found", key)
		}
		kvs.logger.Errorf("Failed to get key %s: %v", key, err)
		return nil, err
	}

	return entry.Value(), nil
}

// SetValue marshals and stores a value in the store
func (kvs *KVStore) SetValue(ctx context.Context, key string, value interface{}) error {
	return kvs.setValueWithRetry(ctx, key, value, 3)
}

// SetValueWithTimeout marshals and stores a value with a timeout
func (kvs *KVStore) SetValueWithTimeout(ctx context.Context, key string, value interface{}, timeout time.Duration) error {
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return kvs.setValueWithRetry(timeoutCtx, key, value, 3)
}

// setValueWithRetry implements the core logic for setting values with retry mechanism
func (kvs *KVStore) setValueWithRetry(ctx context.Context, key string, value interface{}, maxRetries int) error {
	jsonData, err := json.Marshal(value)
	if err != nil {
		kvs.logger.Errorf("Failed to marshal data for key %s: %v", key, err)
		return fmt.Errorf("failed to marshal data: %w", err)
	}

	// Try to get existing entry
	entry, err := kvs.kv.Get(ctx, key)
	if err != nil {
		if err == jetstream.ErrKeyNotFound {
			// Key doesn't exist, create it
			return kvs.createNewEntry(ctx, key, jsonData)
		}
		kvs.logger.Errorf("Failed to get key %s: %v", key, err)
		return err
	}

	// Key exists, update it with retry logic
	return kvs.updateExistingEntry(ctx, key, jsonData, entry.Revision(), maxRetries)
}

// createNewEntry creates a new entry in the store
func (kvs *KVStore) createNewEntry(ctx context.Context, key string, data []byte) error {
	newRevision, err := kvs.kv.Put(ctx, key, data)
	if err != nil {
		kvs.logger.Errorf("Failed to create key %s: %v", key, err)
		return err
	}

	kvs.saveHeartbeatEntry(ctx, key, newRevision)
	return nil
}

// updateExistingEntry updates an existing entry with retry logic
func (kvs *KVStore) updateExistingEntry(ctx context.Context, key string, data []byte, baseRevision uint64, maxRetries int) error {
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		// Get current revision (either from heartbeat or base revision)
		revision := baseRevision
		if attempt > 0 {
			// For retries, get the latest revision from heartbeat
			heartbeatRevision, err := kvs.getHeartbeatRevision(ctx, key)
			if err != nil {
				kvs.logger.Warnf("Failed to get heartbeat revision for key %s, using base revision: %v", key, err)
			} else {
				revision = heartbeatRevision
			}
		}

		newRevision, err := kvs.kv.Update(ctx, key, data, revision)
		if err != nil {
			lastErr = err
			kvs.logger.Warnf("Failed to update key %s at attempt %d/%d: %v", key, attempt+1, maxRetries, err)

			// Add small delay between retries
			if attempt < maxRetries-1 {
				select {
				case <-time.After(time.Millisecond * 100):
				case <-ctx.Done():
					return ctx.Err()
				}
			}
			continue
		}

		// Success
		kvs.saveHeartbeatEntry(ctx, key, newRevision)
		return nil
	}

	kvs.logger.Errorf("Failed to update key %s after %d attempts", key, maxRetries)
	return fmt.Errorf("failed to update key after %d attempts: %w", maxRetries, lastErr)
}

// saveHeartbeatEntry saves the revision number for optimistic locking
func (kvs *KVStore) saveHeartbeatEntry(ctx context.Context, baseKey string, revision uint64) {
	heartbeatValue := strconv.FormatUint(revision, 10)
	fullKey := kvs.getHeartbeatKey(baseKey)

	_, err := kvs.kv.Put(ctx, fullKey, []byte(heartbeatValue))
	if err != nil {
		kvs.logger.Warnf("Failed to set heartbeat entry for key %s: %v", fullKey, err)
	}
}

// getHeartbeatRevision retrieves the stored revision number
func (kvs *KVStore) getHeartbeatRevision(ctx context.Context, baseKey string) (uint64, error) {
	fullKey := kvs.getHeartbeatKey(baseKey)
	entry, err := kvs.kv.Get(ctx, fullKey)
	if err != nil {
		return 0, fmt.Errorf("failed to get heartbeat entry: %w", err)
	}

	revision, err := strconv.ParseUint(string(entry.Value()), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("failed to parse heartbeat revision: %w", err)
	}

	return revision, nil
}

// getHeartbeatKey generates the heartbeat key for a given base key
func (kvs *KVStore) getHeartbeatKey(baseKey string) string {
	return fmt.Sprintf("%s.last_revision", baseKey)
}

// DeleteEntry removes a key from the store
func (kvs *KVStore) DeleteEntry(ctx context.Context, key string) error {
	err := kvs.kv.Delete(ctx, key)
	if err != nil {
		kvs.logger.Errorf("Failed to delete key %s: %v", key, err)
		return err
	}

	// Also delete the heartbeat entry
	heartbeatKey := kvs.getHeartbeatKey(key)
	if err := kvs.kv.Delete(ctx, heartbeatKey); err != nil {
		kvs.logger.Warnf("Failed to delete heartbeat entry for key %s: %v", heartbeatKey, err)
	}

	return nil
}

func (kvs *KVStore) DeleteAllEntries(ctx context.Context) error {
	keys, err := kvs.ListKeys(ctx)
	if err != nil {
		return fmt.Errorf("failed to list keys: %w", err)
	}

	if len(keys) == 0 {
		kvs.logger.Info("No keys found")
		return nil
	}

	var deletedCount int
	var errors []string

	for _, key := range keys {
		// Skip heartbeat keys - they'll be deleted with their main keys
		if kvs.isHeartbeatKey(key) {
			continue
		}

		if err := kvs.DeleteEntry(ctx, key); err != nil {
			errorMsg := fmt.Sprintf("failed to delete key %s: %v", key, err)
			errors = append(errors, errorMsg)
			kvs.logger.Errorf(errorMsg)
		} else {
			deletedCount++
		}

		// Check context cancellation periodically
		select {
		case <-ctx.Done():
			return fmt.Errorf("deletion cancelled after %d entries: %w", deletedCount, ctx.Err())
		default:
			// Continue
		}
	}

	kvs.logger.Infof("Deleted: %d entries", deletedCount)

	if len(errors) > 0 {
		return fmt.Errorf("completed with %d errors: %s", len(errors), strings.Join(errors, "; "))
	}

	return nil
}

// isHeartbeatKey checks if a key is a heartbeat key
func (kvs *KVStore) isHeartbeatKey(key string) bool {
	return strings.HasSuffix(key, ".last_revision")
}

// KeyExists checks if a key exists in the store
func (kvs *KVStore) KeyExists(ctx context.Context, key string) (bool, error) {
	_, err := kvs.kv.Get(ctx, key)
	if err != nil {
		if err == jetstream.ErrKeyNotFound {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// ListKeys returns all keys with the given prefix
func (kvs *KVStore) ListKeys(ctx context.Context) ([]string, error) {
	keys := make([]string, 0)

	// Get key lister from NATS JetStream KV
	keyLister, err := kvs.kv.ListKeys(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list keys: %w", err)
	}

	// Iterate through all keys
	for key := range keyLister.Keys() {
		if key != "" && !strings.HasSuffix(key, ".last_revision") {
			keys = append(keys, key)
		}
	}

	return keys, nil
}
