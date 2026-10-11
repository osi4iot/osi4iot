package flows_manager

import (
	"pipelines/common"
	"strconv"
	"strings"
)

func (fm *FlowsManager) GetTopics() []*common.Topic {
	var topics []*common.Topic
	fm.Topics.Range(func(key, value interface{}) bool {
		topics = append(topics, value.(*common.Topic))
		return true
	})
	return topics
}

func (fm *FlowsManager) GetTopic(topicId int) *common.Topic {
	if topic, ok := fm.Topics.Load(strconv.Itoa(topicId)); ok {
		return topic.(*common.Topic)
	}
	return nil
}

func (fm *FlowsManager) AddTopic(topic *common.Topic) {
	topicIdStr := strconv.Itoa(topic.Id)
	if _, ok := fm.Topics.Load(topicIdStr); !ok {
		fm.Topics.Store(topicIdStr, topic)
	} else {
		fm.log.Warnf("Topic with ID %d already exists", topic.Id)
	}
}

func (fm *FlowsManager) AddTopics(topics []*common.Topic) {
	for _, topic := range topics {
		topicIdStr := strconv.Itoa(topic.Id)
		if _, ok := fm.Topics.Load(topicIdStr); !ok {
			fm.Topics.Store(topicIdStr, topic)
		} else {
			fm.log.Warnf("Topic with ID %d already exists", topic.Id)
		}
	}
}

func (fm *FlowsManager) DeleteTopic(topicId int) error {
	topicIdStr := strconv.Itoa(topicId)
	if _, ok := fm.Topics.Load(topicIdStr); ok {
		fm.Topics.Delete(topicIdStr)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateTopic(topic *common.Topic) error {
	topicIdStr := strconv.Itoa(topic.Id)
	if _, ok := fm.Topics.Load(topicIdStr); ok {
		fm.Topics.Store(topicIdStr, topic)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) GetTopicByTopicRef(assetId int, digitalTwinId int, topicRef string) *common.Topic {
	var topic *common.Topic

	if strings.Contains(topicRef, "dev2pdb") {
		topic = fm.GetTopicByAssetId(assetId, topicRef)
	} else {
		topic = fm.GetTopicByADigitalTwinId(digitalTwinId, topicRef)
	}

	return topic
}
