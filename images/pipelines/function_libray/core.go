package function_libray

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strings"

	"time"
)

type CoreJSProvider struct{}

func (p *CoreJSProvider) GetJSFunctions(node common.Node, fm common.Manager, log *logger.Logger) []common.JSFunction {
	return []common.JSFunction{
		{
			Name: "log",
			Func: func(level, message string) {
				p.log(level, message, node, log)
			},
		},
		{
			Name: "getCurrentTime",
			Func: func() string {
				return p.getCurrentTime()
			},
		},
		{
			Name: "delay",
			Func: func(duration int) {
				p.delay(duration, log)
			},
		},
		{
			Name: "getSubject",
			Func: func(topicRef string) string {
				return p.getSubject(fm, node, topicRef)
			},
		},
		{
			Name: "setValueInStore",
			Func: func(key string, data any) {
				p.setValueInStore(key, data, node, fm, log)
			},
		},
		{
			Name: "getNumberValueFromStore",
			Func: func(key string) float64 {
				return p.getNumberValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "getStringValueFromStore",
			Func: func(key string) string {
				return p.getStringValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "getBooleanValueFromStore",
			Func: func(key string) bool {
				return p.getBooleanValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "getArrayValueFromStore",
			Func: func(key string) []interface{} {
				return p.getArrayValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "getObjectValueFromStore",
			Func: func(key string) map[string]interface{} {
				return p.getObjectValueFromStore(key, node, fm, log)
			},
		},
		{
			Name: "deleteEntryFromStore",
			Func: func(key string) {
				p.deleteEntryFromStore(key, node, fm, log)
			},
		},
		{
			Name: "deleteAllEntriesFromStore",
			Func: func(key string) {
				p.deleteAllEntriesFromStore(key, node, fm, log)
			},
		},		
		{
			Name: "existsKeyInStore",
			Func: func(key string) bool {
				return p.existsKeyInStore(key, node, fm, log)
			},
		},
		{
			Name: "listKeysInStore",
			Func: func() []string {
				return p.listKeysInStore(node, fm, log)
			},
		},		
	}
}

func (p *CoreJSProvider) getFullKvStoreKey(key string, n common.Node) string {
	return fmt.Sprintf("org_%s.dt_%s.kvstore.%s", n.GetOrgHash(), n.GetDigitalTwinUID(), key)
}

func (p *CoreJSProvider) log(level, message string, node common.Node, log *logger.Logger) {
	log.Infof("[%s] %s: %s\n", node.GetUid(), level, message)
}

func (p *CoreJSProvider) getCurrentTime() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func (p *CoreJSProvider) delay(duration int, log *logger.Logger) {
	if duration < 0 {
		log.Errorf("Invalid dgetFulelay duration: %d", duration)
		return
	}
	time.Sleep(time.Duration(duration) * time.Millisecond)
}

func (p *CoreJSProvider) getSubject(fm common.Manager, node common.Node, topicRef string) string {
	topic := fm.GetTopicByTopicRef(node.GetAssetId(), node.GetDigitalTwinId(), topicRef)
	if topic == nil {
		return ""
	}
	return utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
}

func (p *CoreJSProvider) setValueInStore(key string, data interface{}, n common.Node, fm common.Manager, log *logger.Logger) {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return
	}
	fullKey := p.getFullKvStoreKey(key, n)
	err := kvStore.SetValue(context.Background(), fullKey, data)
	if err != nil {
		log.Errorf("Error setting value in store for key %s: %v", fullKey, err)
	}
}

func (p *CoreJSProvider) getNumberValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) float64 {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return 0.0
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetNumberValue(context.Background(), fullKey)
	if err != nil {
		return 0.0
	}
	return value
}

func (p *CoreJSProvider) getStringValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) string {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return ""
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetStringValue(context.Background(), fullKey)
	if err != nil {
		return ""
	}
	return value
}

func (p *CoreJSProvider) getBooleanValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) bool {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return false
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetBoolValue(context.Background(), fullKey)
	if err != nil {
		return false
	}
	return value
}

func (p *CoreJSProvider) getArrayValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) []interface{} {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return nil
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetArrayValue(context.Background(), fullKey)
	if err != nil {
		return nil
	}
	return value
}

func (p *CoreJSProvider) getObjectValueFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) map[string]interface{} {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return nil
	}
	fullKey := p.getFullKvStoreKey(key, n)
	value, err := kvStore.GetObjectValue(context.Background(), fullKey)
	if err != nil {
		return nil
	}
	return value
}

func (p *CoreJSProvider) deleteEntryFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return
	}
	fullKey := p.getFullKvStoreKey(key, n)
	err := kvStore.DeleteEntry(context.Background(), fullKey)
	if err != nil {
		log.Errorf("Error deleting entry from store for key %s: %v", fullKey, err)
	}
}

func (p *CoreJSProvider) deleteAllEntriesFromStore(key string, n common.Node, fm common.Manager, log *logger.Logger) {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return
	}
	fullKey := p.getFullKvStoreKey(key, n)
	err := kvStore.DeleteAllEntries(context.Background())
	if err != nil {
		log.Errorf("Error deleting all entries from store for key %s: %v", fullKey, err)
	}
}

func (p *CoreJSProvider) existsKeyInStore(key string, n common.Node, fm common.Manager, log *logger.Logger) bool {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return false
	}
	fullKey := p.getFullKvStoreKey(key, n)
	exists, err := kvStore.KeyExists(context.Background(), fullKey)
	if err != nil {
		log.Errorf("Error checking existence of key %s: %v", fullKey, err)
		return false
	}
	return exists
}

func (p *CoreJSProvider) listKeysInStore(n common.Node, fm common.Manager, log *logger.Logger) []string {
	kvStore := fm.GetDigitalTwinKvStore(n.GetDigitalTwinId())
	if kvStore == nil {
		log.Errorf("KVStore not found for node %d", n.GetId())
		return nil
	}
	keys, err := kvStore.ListKeys(context.Background())
	if err != nil {
		log.Errorf("Error listing keys in store: %v", err)
		return nil
	}
	shortKeys := make([]string, len(keys))
	for i, key := range keys {
		shortKeys[i] = strings.Split(key, ".")[3] // Assuming the key format is org_orgHash.dt_digitalTwinUID.kvstore.key
	}
	return shortKeys
}
