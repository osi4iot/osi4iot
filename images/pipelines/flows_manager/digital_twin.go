package flows_manager

import (
	"fmt"
	"pipelines/common"
	nats_pkg "pipelines/nats"
	"strconv"
	"strings"

	"github.com/nats-io/nats.go/jetstream"
)

func (fm *FlowsManager) GetDigitalTwins() []*common.DigitalTwin {
	var digitalTwins []*common.DigitalTwin
	fm.DigitalTwins.Range(func(key, value interface{}) bool {
		digitalTwins = append(digitalTwins, value.(*common.DigitalTwin))
		return true
	})
	return digitalTwins
}

func (fm *FlowsManager) GetDigitalTwin(digitalTwinId int) *common.DigitalTwin {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if digitalTwin, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		return digitalTwin.(*common.DigitalTwin)
	}
	return nil
}

func (fm *FlowsManager) AddDigitalTwin(digitalTwin *common.DigitalTwin) {
	digitalTwinIdStr := strconv.Itoa(digitalTwin.Id)
	if _, ok := fm.DigitalTwins.Load(digitalTwinIdStr); !ok {
		org := fm.Admin.GetOrg(digitalTwin.OrgId)
		kv, err := nats_pkg.CreateDigitalTwinKeyValueStore(org.OrgHash, digitalTwin.DigitalTwinUID, fm.log, fm.JetStream)
		if err != nil {
			fm.log.Error("Failed to create KeyValue store for Digital Twin %d: %v", digitalTwin.Id, err)
		} else {
			digitalTwin.KvStore = kv
		}
		fm.DigitalTwins.Store(digitalTwinIdStr, digitalTwin)
	} else {
		fm.log.Error("Digital Twin with ID %d already exists", digitalTwin.Id)
	}
}

func (fm *FlowsManager) AddDigitalTwins(digitalTwins []*common.DigitalTwin) {
	for _, digitalTwin := range digitalTwins {
		fm.AddDigitalTwin(digitalTwin)
	}
}

func (fm *FlowsManager) DeleteDigitalTwin(digitalTwinId int) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if _, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		dtPrefix := fmt.Sprintf("dt:%d:", digitalTwinId)
		dtNodesKey := makeDTNodesKey(digitalTwinId)
		dtWiresKey := makeDTWiresKey(digitalTwinId)

		// Collect all keys to delete before deleting them
		var nodesToDelete, wiresToDelete []string
		var digitalTwinNodesKeys, digitalTwinWiresKeys []string
		var nodeOutputWiresKeys, nodeInputWiresKeys, nodeOutputIndexKeys []string

		// 1. Obtain nodes and wires to delete individually
		if nodes, exists := fm.DigitalTwinNodes.Load(dtNodesKey); exists {
			if nodesList, ok := nodes.([]*common.Node); ok {
				for _, node := range nodesList {
					nodesToDelete = append(nodesToDelete, fmt.Sprintf("%d", (*node).GetId()))
				}
			}
		}

		if wires, exists := fm.DigitalTwinWires.Load(dtWiresKey); exists {
			if wiresList, ok := wires.([]*common.Wire); ok {
				for _, wire := range wiresList {
					wiresToDelete = append(wiresToDelete, fmt.Sprintf("%d", wire.Id))
				}
			}
		}

		// 2. Collect keys related to the digitalTwinId from each map
		fm.DigitalTwinNodes.Range(func(key, value interface{}) bool {
			keyStr, ok := key.(string)
			if ok && (strings.HasPrefix(keyStr, dtPrefix) || keyStr == dtNodesKey) {
				digitalTwinNodesKeys = append(digitalTwinNodesKeys, keyStr)
			}
			return true
		})

		fm.DigitalTwinWires.Range(func(key, value interface{}) bool {
			keyStr, ok := key.(string)
			if ok && (strings.HasPrefix(keyStr, dtPrefix) || keyStr == dtWiresKey) {
				digitalTwinWiresKeys = append(digitalTwinWiresKeys, keyStr)
			}
			return true
		})

		fm.NodeOutputWires.Range(func(key, value interface{}) bool {
			keyStr, ok := key.(string)
			if ok && strings.HasPrefix(keyStr, dtPrefix) {
				nodeOutputWiresKeys = append(nodeOutputWiresKeys, keyStr)
			}
			return true
		})

		fm.NodeInputWires.Range(func(key, value interface{}) bool {
			keyStr, ok := key.(string)
			if ok && strings.HasPrefix(keyStr, dtPrefix) {
				nodeInputWiresKeys = append(nodeInputWiresKeys, keyStr)
			}
			return true
		})

		fm.NodeOutputByIndex.Range(func(key, value interface{}) bool {
			keyStr, ok := key.(string)
			if ok && strings.HasPrefix(keyStr, dtPrefix) {
				nodeOutputIndexKeys = append(nodeOutputIndexKeys, keyStr)
			}
			return true
		})

		// 3. Delete the digital twin and all related nodes and wires
		fm.DigitalTwins.Delete(digitalTwinIdStr)

		for _, nodeId := range nodesToDelete {
			fm.Nodes.Delete(nodeId)
		}

		for _, wireId := range wiresToDelete {
			fm.Wires.Delete(wireId)
		}

		for _, key := range digitalTwinNodesKeys {
			fm.DigitalTwinNodes.Delete(key)
		}

		for _, key := range digitalTwinWiresKeys {
			fm.DigitalTwinWires.Delete(key)
		}

		for _, key := range nodeOutputWiresKeys {
			fm.NodeOutputWires.Delete(key)
		}

		for _, key := range nodeInputWiresKeys {
			fm.NodeInputWires.Delete(key)
		}

		for _, key := range nodeOutputIndexKeys {
			fm.NodeOutputByIndex.Delete(key)
		}

		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateDigitalTwin(digitalTwin *common.DigitalTwin) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwin.Id)
	if _, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		fm.DigitalTwins.Store(digitalTwinIdStr, digitalTwin)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) GetDigitalTwinKvStore(digitalTwinId int) jetstream.KeyValue {
	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		return nil
	}
	return digitalTwin.KvStore
}

func (fm *FlowsManager) AddDigitalTwinTopicsRef(digitalTwinTopics []*common.DigitalTwinTopic) {
	for _, digitalTwinTopic := range digitalTwinTopics {
		topicIdStr := strconv.Itoa(digitalTwinTopic.TopicId)
		value, ok := fm.Topics.Load(topicIdStr)
		if !ok {
			fm.log.Error("Topic with ID %d does not exist", digitalTwinTopic.TopicId)
			return
		}
		topic := value.(*common.Topic)
		key := makeDigitalTwinTopicRefKey(digitalTwinTopic.DigitalTwinId, digitalTwinTopic.TopicRef)
		if _, exists := fm.DigitalTwinTopicsRef.Load(key); !exists {
			fm.DigitalTwinTopicsRef.Store(key, topic)
			fm.log.Info("Added Digital Twin Topic Reference: %s", key)
		} else {
			fm.log.Warn("Digital Twin Topic Reference already exists: %s", key)
		}
	}
}
