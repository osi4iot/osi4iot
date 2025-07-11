package flows_manager

import (
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetAssets() []*common.Asset {
	var assets []*common.Asset
	fm.Assets.Range(func(key, value interface{}) bool {
		assets = append(assets, value.(*common.Asset))
		return true
	})
	return assets
}

func (fm *FlowsManager) GetAsset(assetId int) *common.Asset {
	if asset, ok := fm.Assets.Load(strconv.Itoa(assetId)); ok {
		return asset.(*common.Asset)
	}
	return nil
}

func (fm *FlowsManager) AddAsset(asset *common.Asset) {
	assetIdStr := strconv.Itoa(asset.Id)
	if _, ok := fm.Assets.Load(assetIdStr); !ok {
		fm.Assets.Store(assetIdStr, asset)
	} else {
		fm.log.Error("Asset with ID %d already exists", asset.Id)
	}
}

func (fm *FlowsManager) AddAssets(assets []*common.Asset) {
	for _, asset := range assets {
		assetIdStr := strconv.Itoa(asset.Id)
		if _, ok := fm.Assets.Load(assetIdStr); !ok {
			fm.Assets.Store(assetIdStr, asset)
		} else {
			fm.log.Error("Asset with ID %d already exists", asset.Id)
		}
	}
}

func (fm *FlowsManager) DeleteAsset(assetId int) error {
	assetIdStr := strconv.Itoa(assetId)
	if _, ok := fm.Assets.Load(assetIdStr); ok {
		fm.Assets.Delete(assetIdStr)

		for _, digitalTwin := range fm.GetDigitalTwins() {
			if digitalTwin.AssetId == assetId {
				fm.DeleteDigitalTwin(digitalTwin.Id)
			}
		}

		for _, sensor := range fm.GetSensors() {
			if sensor.AssetId == assetId {
				fm.DeleteSensor(sensor.Id)
			}
		}

		for _, node := range fm.GetNodes() {
			if (*node).GetAssetId() == assetId {
				fm.DeleteNode((*node).GetId())
			}
		}

		for _, wire := range fm.GetWires() {
			if wire.AssetId == assetId {
				fm.DeleteWire(wire.Id)
			}
		}

		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateAsset(asset *common.Asset) error {
	assetIdStr := strconv.Itoa(asset.Id)
	if _, ok := fm.Assets.Load(assetIdStr); ok {
		fm.Assets.Store(assetIdStr, asset)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) AddAssetTopicsRef(assetTopics []*common.AssetTopic) {
	for _, assetTopic := range assetTopics {
		topicIdStr := strconv.Itoa(assetTopic.TopicId)
		value, ok := fm.Topics.Load(topicIdStr)
		if !ok {
			fm.log.Error("Topic with ID %d does not exist", assetTopic.TopicId)
			return
		}
		topic := value.(*common.Topic)
		key := makeAssetTopicRefKey(assetTopic.AssetId, assetTopic.TopicRef)
		if _, exists := fm.AssetTopicsRef.Load(key); !exists {
			fm.AssetTopicsRef.Store(key, topic)
			fm.log.Info("Added Asset Topic Reference: %s", key)
		} else {
			fm.log.Warn("Asset Topic Reference already exists: %s", key)
		}
	}
}
