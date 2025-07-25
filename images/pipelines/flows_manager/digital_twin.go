package flows_manager

import (
	"encoding/json"
	"fmt"
	"pipelines/common"
	nats_pkg "pipelines/nats"
	"strconv"
	"strings"
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
			if nodesList, ok := nodes.([]common.Node); ok {
				for _, node := range nodesList {
					nodesToDelete = append(nodesToDelete, fmt.Sprintf("%d", node.GetId()))
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

		fm.DeleteDigitalTwinTopicsRefByDTid(digitalTwinId)

		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateDigitalTwin(updatedDigitalTwin *common.DigitalTwin) error {
	digitalTwinIdStr := strconv.Itoa(updatedDigitalTwin.Id)
	if entry, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		digitalTwin := entry.(*common.DigitalTwin)
		digitalTwin.Description = updatedDigitalTwin.Description
		digitalTwin.Type = updatedDigitalTwin.Type
		digitalTwin.DashboardID = updatedDigitalTwin.DashboardID
		digitalTwin.MaxNumResFemFiles = updatedDigitalTwin.MaxNumResFemFiles
		digitalTwin.ChatAssistantEnabled = updatedDigitalTwin.ChatAssistantEnabled
		digitalTwin.ChatAssistantLanguage = updatedDigitalTwin.ChatAssistantLanguage
		digitalTwin.DigitalTwinSimulationFormat = updatedDigitalTwin.DigitalTwinSimulationFormat
		digitalTwin.DashboardURL = updatedDigitalTwin.DashboardURL
		digitalTwin.SensorsRef = updatedDigitalTwin.SensorsRef
		digitalTwin.PipelineFileName = updatedDigitalTwin.PipelineFileName
		digitalTwin.PipelineFileLastModifDate = updatedDigitalTwin.PipelineFileLastModifDate
		digitalTwin.PipelineFileData = updatedDigitalTwin.PipelineFileData

		fm.DigitalTwins.Store(digitalTwinIdStr, digitalTwin)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) GetDigitalTwinKvStore(digitalTwinId int) *nats_pkg.KVStore {
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
			fm.log.Errorf("Topic with ID %d does not exist", digitalTwinTopic.TopicId)
			return
		}
		topic := value.(*common.Topic)
		key := makeDigitalTwinTopicRefKey(digitalTwinTopic.DigitalTwinId, digitalTwinTopic.TopicRef)
		if _, exists := fm.DigitalTwinTopicsRef.Load(key); !exists {
			fm.DigitalTwinTopicsRef.Store(key, topic)
			fm.log.Infof("Added Digital Twin Topic Reference: %s", key)
		} else {
			fm.log.Warnf("Digital Twin Topic Reference already exists: %s", key)
		}
	}
}

func (fm *FlowsManager) AddDigitalTwinTopicRef(digitalTwinId int, topicRef string, topicId int) error {
	topicIdStr := strconv.Itoa(topicId)
	value, ok := fm.Topics.Load(topicIdStr)
	if !ok {
		fm.log.Errorf("Topic with ID %d does not exist", topicId)
		return common.ErrNotFound
	}
	topic := value.(*common.Topic)
	key := makeDigitalTwinTopicRefKey(digitalTwinId, topicRef)
	if _, exists := fm.DigitalTwinTopicsRef.Load(key); !exists {
		fm.DigitalTwinTopicsRef.Store(key, topic)
		fm.log.Infof("Added Digital Twin Topic Reference: %s", key)
		return nil
	}
	fm.log.Warn("Digital Twin Topic Reference already exists: %s", key)
	return common.ErrAlreadyExists
}

func (fm *FlowsManager) GetTopicByADigitalTwinId(digitalTwinId int, topicRef string) *common.Topic {
	indexKey := makeDigitalTwinTopicRefKey(digitalTwinId, topicRef)
	if value, ok := fm.DigitalTwinTopicsRef.Load(indexKey); ok {
		return value.(*common.Topic)
	}
	return nil
}

func (fm *FlowsManager) GetTopicsByDigitalTwinId(digitalTwinId int) map[string]*common.Topic {
	topicsMap := make(map[string]*common.Topic)
	fm.DigitalTwinTopicsRef.Range(func(key, value interface{}) bool {
		digitalTwinTopicRefKey := key.(string)
		prefix := "dt:" + strconv.Itoa(digitalTwinId)
		if strings.HasPrefix(digitalTwinTopicRefKey, prefix) {
			topic := value.(*common.Topic)
			topicRef := strings.Split(digitalTwinTopicRefKey, ":")[3] // Assuming format is "dt:<digitalTwinId>:topicRef:<topicRef>"
			topicsMap[topicRef] = topic
		}
		return true
	})
	return topicsMap
}

func (fm *FlowsManager) DeleteDigitalTwinTopicsRefByDTid(digitalTwinId int) error {
	var digitalTwinTopicRefKeysToDelete []common.DigitalTwinTopic
	fm.DigitalTwinTopicsRef.Range(func(key, value interface{}) bool {
		digitalTwinTopicRefKey := key.(string)
		prefix := "dt:" + strconv.Itoa(digitalTwinId)
		if strings.HasPrefix(digitalTwinTopicRefKey, prefix) {
			topic := value.(*common.Topic)
			digitalTwinTopic := common.DigitalTwinTopic{
				DigitalTwinId: digitalTwinId,
				TopicRef:      strings.Split(digitalTwinTopicRefKey, ":")[3], // Assuming format is "dt:<digitalTwinId>:topicRef:<topicRef>"
				TopicId:       topic.Id,
			}
			digitalTwinTopicRefKeysToDelete = append(digitalTwinTopicRefKeysToDelete, digitalTwinTopic)
		}
		return true
	})

	for _, topic := range digitalTwinTopicRefKeysToDelete {
		fm.DeleteDigitalTwinTopicRef(topic.DigitalTwinId, topic.TopicRef)
	}
	return nil
}

func (fm *FlowsManager) DeleteDigitalTwinTopicRef(digitalTwinId int, topicRef string) error {
	key := makeDigitalTwinTopicRefKey(digitalTwinId, topicRef)
	if _, ok := fm.DigitalTwinTopicsRef.Load(key); ok {
		fm.DigitalTwinTopicsRef.Delete(key)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) GetNumOfNodesOfPipeline(digitalTwin *common.DigitalTwin) int {
	numNodes := 0
	pipelineFileData := digitalTwin.PipelineFileData

	var pipelineData common.PipelineData
	if err := json.Unmarshal([]byte(pipelineFileData), &pipelineData); err != nil {
		fm.log.Errorf("Failed to unmarshal pipeline file data: %v", err)
	}
	numNodes = len(pipelineData.Nodes)

	return numNodes
}

func (fm *FlowsManager) CheckIfNodeExistInPipelineFile(digitalTwin *common.DigitalTwin, node *common.NodeData) bool {
	pipelineFileData := digitalTwin.PipelineFileData

	var pipelineData common.PipelineData
	if err := json.Unmarshal([]byte(pipelineFileData), &pipelineData); err != nil {
		fm.log.Errorf("Failed to unmarshal pipeline file data: %v", err)
		return false
	}

	for _, n := range pipelineData.Nodes {
		if n.Name == node.NodeUid && n.Type == node.Type {
			return true
		}
	}
	return false
}
	
