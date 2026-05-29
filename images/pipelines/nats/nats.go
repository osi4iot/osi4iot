package nats

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"pipelines/config"
	"pipelines/logger"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/nats-io/nkeys"
)

type KVStore struct {
	natsKv jetstream.KeyValue
	logger *logger.Logger
}

func Connect(cfg *config.Config, log *logger.Logger) (*nats.Conn, error) {
	opts := []nats.Option{
		nats.Timeout(cfg.NATS.Timeout),
	}

    if cfg.NATS.NKeySeed != "" {
        // Parse the NKey seed and create a signer function
        kp, err := nkeys.FromSeed([]byte(cfg.NATS.NKeySeed))
        if err != nil {
            return nil, fmt.Errorf("error parsing NKey seed: %w", err)
        }

        pubKey, err := kp.PublicKey()
        if err != nil {
            return nil, fmt.Errorf("error getting NKey public key: %w", err)
        }

        opts = append(opts, nats.Nkey(pubKey, func(nonce []byte) ([]byte, error) {
            return kp.Sign(nonce)
        }))
    } 

	if cfg.Mode == "prod" {
		tlsCfg := &tls.Config{
			ServerName: cfg.DomainName,
			MinVersion: tls.VersionTLS12,
		}
		if cfg.NATS.UseCustomCACert == "Yes" {
			// Load custom CA certificate
			caCert, err := os.ReadFile("/etc/nats/ca.pem")
			if err != nil {
				panic(fmt.Sprintf("ca.pem can not be read: %v", err))
			}

			rootCAs, err := x509.SystemCertPool()
			if err != nil || rootCAs == nil {
				rootCAs = x509.NewCertPool()
			}
			if ok := rootCAs.AppendCertsFromPEM(caCert); !ok {
				panic("failed to add ca.pem to CA pool")
			}

			tlsCfg.RootCAs = rootCAs
		} else {
			// Use system CA certs
			rootCAs, err := x509.SystemCertPool()
			if err != nil || rootCAs == nil {
				rootCAs = x509.NewCertPool()
			}
			tlsCfg.RootCAs = rootCAs
		}

		opts = append(opts, nats.Secure(tlsCfg))
	}

	nc, err := nats.Connect(strings.Join(cfg.NATS.ServersUrl, ","), opts...)
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

func CreateAdminStream(
	ctx context.Context,
	shardIndex int,
	numStreamReplicas int,
	log *logger.Logger,
	js jetstream.JetStream,
) (jetstream.Stream, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
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

func CreateAdminConsumer(
	ctx context.Context,
	shardIndex int,
	replicaIndex int,
	log *logger.Logger,
	stream jetstream.Stream,
) (jetstream.Consumer, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
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

func CreateLeaderKeyValueStore(
	ctx context.Context,
	shardIndex int,
	ttl time.Duration,
	log *logger.Logger,
	js jetstream.JetStream,
	numStreamReplicas int,
) (*KVStore, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	kvName := fmt.Sprintf("pipelines_shard_%d_leader", shardIndex)
	kv, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket:   kvName,
		TTL:      ttl,
		Replicas: numStreamReplicas,
	})

	if err != nil {
		if kv2, err2 := js.KeyValue(ctx, kvName); err2 == nil {
			kv = kv2
		} else {
			log.Errorf("Error creating KV store '%s': %v", kvName, err)
			return nil, err
		}
	}

	newKvStore := NewKVStore(kv, log)

	log.Infof("KV store '%s' created successfully", kvName)
	return newKvStore, nil
}

func CreateGroupKeyValueStore(
	ctx context.Context,
	orgHash string,
	GroupUID string,
	log *logger.Logger,
	js jetstream.JetStream,
	numStreamReplicas int,
) (*KVStore, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	kvName := fmt.Sprintf("org_%s-group_%s", orgHash, GroupUID)
	kv, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket:   kvName,
		Replicas: numStreamReplicas,
	})

	if err != nil {
		log.Errorf("Error creating KV store '%s': %v", kvName, err)
		return nil, err
	}

	newKvStore := NewKVStore(kv, log)

	log.Infof("KV store '%s' created successfully", kvName)
	return newKvStore, nil
}

func DeleteGroupKeyValueStore(
	ctx context.Context,
	orgHash string,
	GroupUID string,
	log *logger.Logger,
	js jetstream.JetStream,
) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	kvName := fmt.Sprintf("org_%s-group_%s", orgHash, GroupUID)
	err := js.DeleteKeyValue(ctx, kvName)

	if err != nil {
		log.Errorf("Error deleting KV store '%s': %v", kvName, err)
		return err
	}

	log.Infof("KV store '%s' deleted successfully", kvName)
	return nil
}

func CreateDigitalTwinKeyValueStore(
	ctx context.Context,
	orgHash string,
	digitalTwinUID string,
	log *logger.Logger,
	js jetstream.JetStream,
	numStreamReplicas int,
) (*KVStore, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	kvName := fmt.Sprintf("org_%s-dt_%s", orgHash, digitalTwinUID)
	kv, err := js.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket:   kvName,
		Replicas: numStreamReplicas,
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
	ctx context.Context,
	orgHash string,
	digitalTwinUID string,
	log *logger.Logger,
	js jetstream.JetStream,
) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
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
		natsKv: kv,
		logger: log,
	}
}

func (kvs *KVStore) GetNatsKeyValue() jetstream.KeyValue {
	return kvs.natsKv
}

// GetValue retrieves and unmarshals a value from the store into the provided destination
func (kvs *KVStore) GetValue(ctx context.Context, key string, dest interface{}) error {
	if dest == nil {
		return errors.New("destination cannot be nil")
	}

	entry, err := kvs.natsKv.Get(ctx, key)
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
	entry, err := kvs.natsKv.Get(ctx, key)
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
	return kvs.setValueWithRetry(ctx, key, value, 5)
}

// SetValueWithTimeout marshals and stores a value with a timeout
func (kvs *KVStore) SetValueWithTimeout(ctx context.Context, key string, value interface{}, timeout time.Duration) error {
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return kvs.setValueWithRetry(timeoutCtx, key, value, 5)
}

// setValueWithRetry implements the core logic for setting values with retry mechanism
func (kvs *KVStore) setValueWithRetry(ctx context.Context, key string, value interface{}, maxRetries int) error {
	jsonData, err := json.Marshal(value)
	if err != nil {
		kvs.logger.Errorf("Failed to marshal data for key %s: %v", key, err)
		return fmt.Errorf("failed to marshal data: %w", err)
	}

	var lastErr error
	baseDelay := 5 * time.Millisecond

	for attempt := 0; attempt < maxRetries; attempt++ {
		// Siempre lee la revisión actual
		entry, err := kvs.natsKv.Get(ctx, key)

		if err != nil {
			if err == jetstream.ErrKeyNotFound {
				// Key no existe, créala
				_, err := kvs.natsKv.Put(ctx, key, jsonData)
				if err == nil {
					return nil
				}
				// Si Put falla (alguien la creó entre medio), reintenta el loop
				lastErr = err
				kvs.logger.Warnf("Failed to create key %s at attempt %d/%d: %v", key, attempt+1, maxRetries, err)
			} else {
				kvs.logger.Errorf("Failed to get key %s: %v", key, err)
				return err
			}
		} else {
			// Key existe, actualízala
			_, err := kvs.natsKv.Update(ctx, key, jsonData, entry.Revision())
			if err == nil {
				return nil
			}
			lastErr = err
			kvs.logger.Warnf("Failed to update key %s at attempt %d/%d: %v", key, attempt+1, maxRetries, err)
		}

		// Backoff exponencial con jitter antes de reintentar
		if attempt < maxRetries-1 {
			// Calcula el delay máximo: 5ms, 10ms, 20ms, 40ms...
			maxDelay := baseDelay * time.Duration(1<<attempt)

			// Añade jitter aleatorio (50% del maxDelay ± 50%)
			jitter := time.Duration(rand.Int63n(int64(maxDelay)))
			delay := maxDelay/2 + jitter

			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}

	kvs.logger.Errorf("Failed to set key %s after %d attempts", key, maxRetries)
	return fmt.Errorf("failed to set key after %d attempts: %w", maxRetries, lastErr)
}

// DeleteEntry removes a key from the store
func (kvs *KVStore) DeleteEntry(ctx context.Context, key string) error {
	err := kvs.natsKv.Delete(ctx, key)
	if err != nil {
		kvs.logger.Errorf("Failed to delete key %s: %v", key, err)
		return err
	}
	return nil
}

func (kvs *KVStore) DeleteAllEntries(ctx context.Context) error {
	keys, err := kvs.ListKeys(ctx, "")
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
		if err := kvs.DeleteEntry(ctx, key); err != nil {
			errorMsg := fmt.Sprintf("failed to delete key %s: %v", key, err)
			errors = append(errors, errorMsg)
			kvs.logger.Errorf(errorMsg)
		} else {
			deletedCount++
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("deletion cancelled after %d entries: %w", deletedCount, ctx.Err())
		default:
		}
	}

	kvs.logger.Infof("Deleted: %d entries", deletedCount)

	if len(errors) > 0 {
		return fmt.Errorf("completed with %d errors: %s", len(errors), strings.Join(errors, "; "))
	}

	return nil
}

// KeyExists checks if a key exists in the store
func (kvs *KVStore) KeyExists(ctx context.Context, key string) (bool, error) {
	_, err := kvs.natsKv.Get(ctx, key)
	if err != nil {
		if err == jetstream.ErrKeyNotFound {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// ListKeys returns all keys with the given prefix
func (kvs *KVStore) ListKeys(ctx context.Context, prefix string) ([]string, error) {
	keys := make([]string, 0)

	// Get key lister from NATS JetStream KV
	keyLister, err := kvs.natsKv.ListKeys(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list keys: %w", err)
	}

	// Iterate through all keys
	for key := range keyLister.Keys() {
		if key != "" && strings.HasPrefix(key, prefix) {
			keys = append(keys, key)
		}
	}

	return keys, nil
}
