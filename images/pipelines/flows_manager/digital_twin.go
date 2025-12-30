package flows_manager

import (
	"encoding/json"
	"fmt"
	"pipelines/common"
	nats_pkg "pipelines/nats"
	"pipelines/utils"
	"strconv"
	"strings"

	"github.com/nats-io/nats.go"
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

func (fm *FlowsManager) AddDigitalTwin(digitalTwin *common.DigitalTwin, createPipeline bool) {
	digitalTwinIdStr := strconv.Itoa(digitalTwin.Id)
	if _, ok := fm.DigitalTwins.Load(digitalTwinIdStr); !ok {
		org := fm.GetOrg(digitalTwin.OrgId)
		kv, err := nats_pkg.CreateDigitalTwinKeyValueStore(org.OrgHash, digitalTwin.DigitalTwinUid, fm.log, fm.JetStream)
		if err != nil {
			fm.log.Error("Failed to create KeyValue store for Digital Twin %d: %v", digitalTwin.Id, err)
		} else {
			digitalTwin.KvStore = kv
		}

		if createPipeline {
			digitalTwin.Pipeline = fm.createPipeline(digitalTwin, org, "create")
			digitalTwin.PipelineStatusSubscription = fm.SetPipelineStatusSubscription(digitalTwin)
		} else {
			digitalTwin.Pipeline = nil
		}
		fm.DigitalTwins.Store(digitalTwinIdStr, digitalTwin)
	} else {
		fm.log.Error("Digital Twin with ID %d already exists", digitalTwin.Id)
	}
}

func (fm *FlowsManager) AddDigitalTwins(digitalTwins []*common.DigitalTwin) {
	for _, digitalTwin := range digitalTwins {
		fm.AddDigitalTwin(digitalTwin, true)
	}
}

func (fm *FlowsManager) CreatePipelineInDigitalTwin(digitalTwinId int) {
	fm.log.Infof("Creating pipeline for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	org := fm.GetOrg(digitalTwin.OrgId)
	digitalTwin.Pipeline = fm.createPipeline(digitalTwin, org, "create")
	digitalTwin.PipelineStatusSubscription = fm.SetPipelineStatusSubscription(digitalTwin)
	digitalTwin.Pipeline.Start(true)
}

func (fm *FlowsManager) UpdatePipelineInDigitalTwin(digitalTwinId int) {
	fm.log.Infof("Updating pipeline for digital twin %d", digitalTwinId)

	digitalTwin := fm.GetDigitalTwin(digitalTwinId)
	if digitalTwin == nil {
		fm.log.Errorf("Digital twin %d not found", digitalTwinId)
		return
	}

	if digitalTwin.Pipeline != nil {
		digitalTwin.Pipeline.Stop("update")
	}
	org := fm.GetOrg(digitalTwin.OrgId)
	digitalTwin.Pipeline = fm.createPipeline(digitalTwin, org, "update")
	digitalTwin.Pipeline.Start(false)
}


func (fm *FlowsManager) SetPipelineStatusSubscription(digitalTwin *common.DigitalTwin) *nats.Subscription {
	p := digitalTwin.Pipeline
	sim2stateTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "sim2state")
	sim2stateSubject := utils.TopicToNatsSubject(sim2stateTopic.TopicType, sim2stateTopic.GroupUid, sim2stateTopic.TopicUid)

	if sim2stateSubject == "" {
		fm.log.Errorf("No sim2state subject is set for digital twin %d", digitalTwin.Id)
		return nil
	}

	queueName := fmt.Sprintf("pipeline_status_%s", digitalTwin.DigitalTwinUid)
	sub, err := fm.NatsQueueSubscribe(sim2stateSubject, queueName, func(msg *nats.Msg) {
		var rawMessage map[string]interface{}
		if err := json.Unmarshal(msg.Data, &rawMessage); err != nil {
			fm.log.Errorf("failed to unmarshal message for digital twin %d: %w", digitalTwin.Id, err)
			return
		}

		if action, ok := rawMessage["action"].(string); ok {
			switch action {
			case "queryPipelineStatus":
				pipelineStatus := p.GetStatus().String()
				replicaIndexLeader := p.GetReplicaIndexLeader()
				payload := common.PipelineStatusMessage{
					PipelineStatus:     pipelineStatus,
					ReplicaIndexLeader: replicaIndexLeader,
				}
				p.PublishPipelineStatus(payload)
			case "queryChatMessages":
				if userName, ok := rawMessage["userName"].(string); ok {
					p.PublishChatMessages(userName)
				} else {
					fm.log.Errorf("userName not found in message for digital twin %d", digitalTwin.Id)
				}
			case "queryRemoveChatMessages":
				if userName, ok := rawMessage["userName"].(string); ok {
					p.ClearChatMessagesHistory(userName)
				} else {
					fm.log.Errorf("userName not found in message for digital twin %d", digitalTwin.Id)
				}
			}
		}

	})
	if err != nil {
		fm.log.Errorf("Failed to subscribe to status subject for digital twin %d: %v", digitalTwin.Id, err)
		return nil
	}
	return sub
}

func (fm *FlowsManager) DeleteDigitalTwin(digitalTwinId int) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if entry, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		digitalTwin := entry.(*common.DigitalTwin)
		if digitalTwin.PipelineStatusSubscription != nil {
			digitalTwin.PipelineStatusSubscription.Unsubscribe()
		}
		if digitalTwin.Pipeline != nil {
			digitalTwin.Pipeline.Stop("delete")
		}
		fm.DigitalTwins.Delete(digitalTwinIdStr)
		fm.DeleteDigitalTwinTopicsRefByDTid(digitalTwinId)

		// Delete FEM results folder
		digitalTwinFolderPath := fm.GetDigitalTwinFolder(digitalTwin.OrgId, digitalTwin.GroupId, digitalTwin.Id)
		if digitalTwinFolderPath != "" {
			err := utils.DeleteFolder(digitalTwinFolderPath)
			if err != nil {
				return err
			}
		}

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
	var pipelineNodes []common.PipelineNode
	if err := json.Unmarshal([]byte(digitalTwin.PipelineFileData), &pipelineNodes); err != nil {
		fm.log.Errorf("Failed to unmarshal pipeline file data: %v", err)
	}
	numNodes = len(pipelineNodes)

	return numNodes
}

func (fm *FlowsManager) CheckIfNodeExistInPipelineFile(digitalTwin *common.DigitalTwin, node *common.NodeData) bool {
	var pipelineNodes []common.PipelineNode
	if err := json.Unmarshal([]byte(digitalTwin.PipelineFileData), &pipelineNodes); err != nil {
		fm.log.Errorf("Failed to unmarshal pipeline file data: %v", err)
		return false
	}

	for _, n := range pipelineNodes {
		if n.Name == node.NodeUid && n.Type == node.Type {
			return true
		}
	}
	return false
}

func (fm *FlowsManager) GetS3DigitalTwinFolderInfo(groupId int, digitalTwinId int, folder string) []*common.S3FolderFileInfo {
	return fm.Admin.GetS3DigitalTwinFolderInfo(groupId, digitalTwinId, folder)
}

func (fm *FlowsManager) AddFemResultsInDigitalTwin(digitalTwinId int) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if entry, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		digitalTwin := entry.(*common.DigitalTwin)
		femResultPath := fm.GetFemResultsPath(digitalTwin.OrgId, digitalTwin.GroupId, digitalTwin.Id)
		if femResultPath != "" {
			fm.Admin.ProcessFemResultFile(femResultPath, digitalTwin.GroupId, digitalTwin.Id)
		}
	}
	return nil
}

func (fm *FlowsManager) AddFemResultsInDigitalTwins() error {
	digitalTwins := fm.GetDigitalTwins()
	for _, digitalTwin := range digitalTwins {
		fm.AddFemResultsInDigitalTwin(digitalTwin.Id)
	}
	return nil
}

func (fm *FlowsManager) DeleteFemResultsInDigitalTwin(digitalTwinId int) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if entry, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		digitalTwin := entry.(*common.DigitalTwin)
		femResultPath := fm.GetFemResultsPath(digitalTwin.OrgId, digitalTwin.GroupId, digitalTwin.Id)
		if femResultPath != "" {
			err := utils.DeleteFolder(femResultPath)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func (fm *FlowsManager) AddDocInfoFileInDigitalTwin(digitalTwinId int) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if entry, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		digitalTwin := entry.(*common.DigitalTwin)
		docInfoFilesPath := fm.GetDocInfoFilesPath(digitalTwin.OrgId, digitalTwin.GroupId, digitalTwin.Id)
		if docInfoFilesPath != "" {
			fm.Admin.ProcessDocInfoFile(docInfoFilesPath, digitalTwin.GroupId, digitalTwin.Id)
		}
	}
	return nil
}

func (fm *FlowsManager) AddDocInfoFilesInDigitalTwins() error {
	digitalTwins := fm.GetDigitalTwins()
	for _, digitalTwin := range digitalTwins {
		fm.AddDocInfoFileInDigitalTwin(digitalTwin.Id)
	}
	return nil
}

func (fm *FlowsManager) DeleteDocInfoFileInDigitalTwin(digitalTwinId int) error {
	digitalTwinIdStr := strconv.Itoa(digitalTwinId)
	if entry, ok := fm.DigitalTwins.Load(digitalTwinIdStr); ok {
		digitalTwin := entry.(*common.DigitalTwin)
		docInfoFilePath := fm.GetDocInfoFilesPath(digitalTwin.OrgId, digitalTwin.GroupId, digitalTwin.Id)
		if docInfoFilePath != "" {
			err := utils.DeleteFolder(docInfoFilePath)
			if err != nil {
				return err
			}
		}
	}
	return nil
}
