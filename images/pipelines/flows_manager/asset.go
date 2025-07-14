package flows_manager

import (
	"pipelines/common"
	"strconv"
	"strings"
)

func (fm *FlowsManager) DeleteAsset(assetId int) error {
	var assetTopicsRefToDelete []common.AssetTopic
	var topicsToDelete []int
	fm.AssetTopicsRef.Range(func(key, value interface{}) bool {
		assetTopicKey := key.(string)
		prefix := "asset:" + strconv.Itoa(assetId)
		if strings.HasPrefix(assetTopicKey, prefix) {
			topic := value.(*common.Topic)
			assetTopic := common.AssetTopic{
				AssetId:  assetId,
				TopicId:  topic.Id,
				TopicRef: strings.Split(assetTopicKey, ":")[3], // Assuming format is "asset:<assetId>:topicRef:<topicRef>"
			}
			assetTopicsRefToDelete = append(assetTopicsRefToDelete, assetTopic)
			topicsToDelete = append(topicsToDelete, topic.Id)
		}
		return true
	})

	for _, assetTopic := range assetTopicsRefToDelete {
		fm.DeleteAssetTopicRef(assetTopic.AssetId, assetTopic.TopicRef)
	}

	for _, topicId := range topicsToDelete {
		fm.DeleteTopic(topicId)
	}

	return nil
}

func (fm *FlowsManager) AddAssetTopicRef(assetId int, topicId int, topicRef string) {
	topicIdStr := strconv.Itoa(topicId)
	if value, ok := fm.Topics.Load(topicIdStr); ok {
		topic := value.(*common.Topic)
		key := makeAssetTopicRefKey(assetId, topicRef)
		if _, exists := fm.AssetTopicsRef.Load(key); !exists {
			fm.AssetTopicsRef.Store(key, topic)
			fm.log.Infof("Added Asset Topic Reference: %s", key)
		} else {
			fm.log.Warnf("Asset Topic Reference already exists: %s", key)
		}
	} else {
		fm.log.Errorf("Topic with ID %d does not exist", topicId)
	}
}

func (fm *FlowsManager) DeleteAssetTopic(assetId int, topicRef string) error {
	key := makeAssetTopicRefKey(assetId, topicRef)
	if _, ok := fm.AssetTopicsRef.Load(key); ok {
		fm.AssetTopicsRef.Delete(key)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) DeleteAssetTopicRef(assetId int, topicRef string) error {
	key := makeAssetTopicRefKey(assetId, topicRef)
	if _, ok := fm.AssetTopicsRef.Load(key); ok {
		fm.AssetTopicsRef.Delete(key)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) AddAssetTopicsRef(assetTopics []*common.AssetTopic) {
	for _, assetTopic := range assetTopics {
		topicIdStr := strconv.Itoa(assetTopic.TopicId)
		value, ok := fm.Topics.Load(topicIdStr)
		if !ok {
			fm.log.Errorf("Topic with ID %d does not exist", assetTopic.TopicId)
			return
		}
		topic := value.(*common.Topic)
		key := makeAssetTopicRefKey(assetTopic.AssetId, assetTopic.TopicRef)
		if _, exists := fm.AssetTopicsRef.Load(key); !exists {
			fm.AssetTopicsRef.Store(key, topic)
			fm.log.Infof("Added Asset Topic Reference: %s", key)
		} else {
			fm.log.Warn("Asset Topic Reference already exists: %s", key)
		}
	}
}

func (fm *FlowsManager) GetTopicByAssetId(assetId int, topicRef string) *common.Topic {
	indexKey := makeAssetTopicRefKey(assetId, topicRef)
	if value, ok := fm.AssetTopicsRef.Load(indexKey); ok {
		return value.(*common.Topic)
	}
	return nil
}

func (fm *FlowsManager) GetTopicsByAssetId(assetId int) map[string]*common.Topic {
	topicsMap := make(map[string]*common.Topic)
	fm.AssetTopicsRef.Range(func(key, value interface{}) bool {
		assetTopicRefKey := key.(string)
		prefix := "asset:" + strconv.Itoa(assetId)
		if strings.HasPrefix(assetTopicRefKey, prefix) {
			topic := value.(*common.Topic)
			topicRef := strings.Split(assetTopicRefKey, ":")[3] // Assuming format is "asset:<assetId>:topicRef:<topicRef>"
			topicsMap[topicRef] = topic
		}
		return true
	})
	return topicsMap
}
