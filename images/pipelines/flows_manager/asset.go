package flows_manager

import (
	"context"
	"fmt"
	"pipelines/common"
	"strconv"
	"strings"
)

func (fm *FlowsManager) GetAssets() []*common.Asset {
	var assets []*common.Asset
	fm.Assets.Range(func(key, value interface{}) bool {
		assets = append(assets, value.(*common.Asset))
		return true
	})
	return assets
}

func (fm *FlowsManager) GetAssetById(assetId int) *common.Asset {
	if asset, ok := fm.Assets.Load(strconv.Itoa(assetId)); ok {
		return asset.(*common.Asset)
	}
	return nil
}

func (fm *FlowsManager) GetAssetByUid(assetUid string) *common.Asset {
	var foundAsset *common.Asset
	fm.Assets.Range(func(key, value interface{}) bool {
		asset := value.(*common.Asset)
		if asset.AssetUid == assetUid {
			foundAsset = asset
			return false // stop iteration
		}
		return true // continue iteration
	})
	return foundAsset
}

func (fm *FlowsManager) GetAssetByShortUidAndGroupId(shortUid string, groupId int) *common.Asset {
	var foundAsset *common.Asset
	fm.Assets.Range(func(key, value interface{}) bool {
		asset := value.(*common.Asset)
		if strings.HasPrefix(asset.AssetUid, shortUid) && asset.GroupId == groupId {
			foundAsset = asset
			return false // stop iteration
		}
		return true // continue iteration
	})
	return foundAsset
}

func (fm *FlowsManager) AddAsset(ctx context.Context, asset *common.Asset) {
	assetIdStr := strconv.Itoa(asset.Id)
	if _, ok := fm.Assets.Load(assetIdStr); !ok {
		groupId := asset.GroupId
		kvStore := fm.GetGroupKvStore(groupId)
		if kvStore == nil {
			fm.log.Warnf("KV Store for Group ID %d is not available for Asset with ID %d", groupId, asset.Id)
		} else {
			group := fm.GetGroup(groupId)
			org := fm.GetOrg(group.OrgId)
			if group != nil && org != nil {
				assetStateKey := fm.GetAssetStateKvStoreKey(org.OrgHash, group.GroupUID, asset.AssetUid)
				existsKey, err := kvStore.KeyExists(ctx, assetStateKey)
				if err != nil {
					fm.log.Errorf("Error checking if key exists in store for key %s: %v", assetStateKey, err)
				}
				if !existsKey {
					assetState := map[string]any{
						"status": "Unknown",
						"state_description": common.DefaultAssetStateDescription,
					}
					err = kvStore.SetValue(ctx, assetStateKey, assetState)
					if err != nil {
						fm.log.Errorf("Error setting initial asset state in store for key %s: %v", assetStateKey, err)
					}
				}
			} else {
				fm.log.Warnf("Group with ID %d or Org with ID %d not found for Asset with ID %d", groupId, group.OrgId, asset.Id)
			}
		}
		fm.Assets.Store(assetIdStr, asset)
	} else {
		fm.log.Warnf("Asset with ID %d already exists", asset.Id)
	}
}

func (fm *FlowsManager) AddAssets(ctx context.Context, assets []*common.Asset) {
	for _, asset := range assets {
		fm.AddAsset(ctx, asset)
	}
}

func (fm *FlowsManager) UpdateAsset(asset *common.Asset) error {
	assetIdStr := strconv.Itoa(asset.Id)
	if _, ok := fm.Assets.Load(assetIdStr); ok {
		fm.Assets.Store(assetIdStr, asset)
	} else {
		fm.log.Warnf("Asset with ID %d does not exist for update", asset.Id)
		return common.ErrNotFound
	}
	return nil
}

func (fm *FlowsManager) DeleteAsset(assetId int) error {
	var assetTopicsRefToDelete []common.AssetTopic
	var topicsToDelete []int
	prefix := "asset:" + strconv.Itoa(assetId) + ":" // Assuming format is "asset:<assetId>:topicRef:<topicRef>"
	fm.AssetTopicsRef.Range(func(key, value interface{}) bool {
		assetTopicKey := key.(string)
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
	prefix := "asset:" + strconv.Itoa(assetId) + ":" // Assuming format is "asset:<assetId>:topicRef:<topicRef>"

	fm.AssetTopicsRef.Range(func(key, value interface{}) bool {
		assetTopicRefKey := key.(string)
		if strings.HasPrefix(assetTopicRefKey, prefix) {
			parts := strings.Split(assetTopicRefKey, ":")
			topicRef := parts[3]
			topic := value.(*common.Topic)
			topicsMap[topicRef] = topic
		}
		return true
	})
	return topicsMap
}

func (fm *FlowsManager) GetAssetsByGroupId(groupId int) []*common.Asset {
	var assets []*common.Asset
	fm.Assets.Range(func(key, value interface{}) bool {
		asset := value.(*common.Asset)
		if asset.GroupId == groupId {
			assets = append(assets, asset)
		}
		return true
	})
	return assets
}

func (fm *FlowsManager) GetAssetStateKvStoreKey(orgHash string, groupUid string, assetUid string) string {
	return fmt.Sprintf("org_%s-group_%s.asset_states.asset_%s", orgHash, groupUid, assetUid)
}
