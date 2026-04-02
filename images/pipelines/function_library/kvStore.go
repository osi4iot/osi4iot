package function_library

import (
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"strings"
)


type KvStore struct {
	node common.Node
	fm   common.Manager
	log  *logger.Logger
}

func NewKvStore(node common.Node, fm common.Manager, log *logger.Logger) *KvStore {
	return &KvStore{
		node: node,
		fm:   fm,
		log:  log,
	}
}

func (kv *KvStore) getFullKvStoreKey(key string) string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.%s", kv.node.GetOrgHash(), kv.node.GetDigitalTwinUid(), key)
}


func (kv *KvStore) SetValue(key string, data interface{}) {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return
	}
	fullKey := kv.getFullKvStoreKey(key)
	err := kvStore.SetValue(kv.node.GetNodeContext(), fullKey, data)
	if err != nil {
		kv.log.Errorf("Error setting value in store for key %s: %v", fullKey, err)
	}
}

func (kv *KvStore) GetNumberValue(key string) float64 {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return 0.0
	}
	fullKey := kv.getFullKvStoreKey(key)
	value, err := kvStore.GetNumberValue(kv.node.GetNodeContext(), fullKey)
	if err != nil {
		return 0.0
	}
	return value
}

func (kv *KvStore) GetStringValue(key string) string {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return ""
	}
	fullKey := kv.getFullKvStoreKey(key)
	value, err := kvStore.GetStringValue(kv.node.GetNodeContext(), fullKey)
	if err != nil {
		return ""
	}
	return value
}

func (kv *KvStore) GetBooleanValue(key string) bool {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return false
	}
	fullKey := kv.getFullKvStoreKey(key)
	value, err := kvStore.GetBoolValue(kv.node.GetNodeContext(), fullKey)
	if err != nil {
		return false
	}
	return value
}

func (kv *KvStore) GetArrayValue(key string) []interface{} {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return nil
	}
	fullKey := kv.getFullKvStoreKey(key)
	value, err := kvStore.GetArrayValue(kv.node.GetNodeContext(), fullKey)
	if err != nil {
		return nil
	}
	return value
}

func (kv *KvStore) GetObjectValue(key string) map[string]interface{} {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return nil
	}
	fullKey := kv.getFullKvStoreKey(key)
	value, err := kvStore.GetObjectValue(kv.node.GetNodeContext(), fullKey)
	if err != nil {
		return nil
	}
	return value
}

func (kv *KvStore) DeleteEntry(key string) {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return
	}
	fullKey := kv.getFullKvStoreKey(key)
	err := kvStore.DeleteEntry(kv.node.GetNodeContext(), fullKey)
	if err != nil {
		kv.log.Errorf("Error deleting entry from store for key %s: %v", fullKey, err)
	}
}

func (kv *KvStore) DeleteAllEntries(key string) {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return
	}
	fullKey := kv.getFullKvStoreKey(key)
	err := kvStore.DeleteAllEntries(kv.node.GetNodeContext())
	if err != nil {
		kv.log.Errorf("Error deleting all entries from store for key %s: %v", fullKey, err)
	}
}

func (kv *KvStore) ExistsKey(key string) bool {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return false
	}
	fullKey := kv.getFullKvStoreKey(key)
	exists, err := kvStore.KeyExists(kv.node.GetNodeContext(), fullKey)
	if err != nil {
		kv.log.Errorf("Error checking existence of key %s: %v", fullKey, err)
		return false
	}
	return exists
}

func (kv *KvStore) ListKeys() []string {
	kvStore := kv.fm.GetDigitalTwinKvStore(kv.node.GetDigitalTwinId())
	if kvStore == nil {
		kv.log.Errorf("KVStore not found for node %s", kv.node.GetUid())
		return nil
	}

	prefix := fmt.Sprintf("org_%s.dt_%s.kvstore.", kv.node.GetOrgHash(), kv.node.GetDigitalTwinUid())

	keys, err := kvStore.ListKeys(kv.node.GetNodeContext(), prefix)
	if err != nil {
		kv.log.Errorf("Error listing keys in store: %v", err)
		return nil
	}
	shortKeys := make([]string, len(keys))
	for i, key := range keys {
		shortKeys[i] = strings.Split(key, ".")[3] // Assuming the key format is org_orgHash.dt_digitalTwinUID.kvstore.key
	}
	return shortKeys
}
