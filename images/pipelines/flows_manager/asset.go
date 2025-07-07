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