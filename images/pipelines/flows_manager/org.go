package flows_manager

import (
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetOrgs() []*common.Org {
	var orgs []*common.Org
	fm.Orgs.Range(func(key, value interface{}) bool {
		orgs = append(orgs, value.(*common.Org))
		return true
	})
	return orgs
}

func (fm *FlowsManager) GetOrg(orgId int) *common.Org {
	orgIdStr := strconv.Itoa(orgId)
	if org, ok := fm.Orgs.Load(orgIdStr); ok {
		return org.(*common.Org)
	}
	return nil
}

func (fm *FlowsManager) AddOrg(org *common.Org) {
	orgIdStr := strconv.Itoa(org.Id)
	if _, ok := fm.Orgs.Load(orgIdStr); !ok {
		fm.Orgs.Store(orgIdStr, org)
	} else {
		fm.log.Error("Org with ID %d already exists", org.Id)
	}
}

func (fm *FlowsManager) AddOrgs(orgs []*common.Org) {
	for _, org := range orgs {
		orgIdStr := strconv.Itoa(org.Id)
		if _, ok := fm.Orgs.Load(orgIdStr); !ok {
			fm.Orgs.Store(orgIdStr, org)
		} else {
			fm.log.Error("Org with ID %d already exists", org.Id)
		}
	}
}

func (fm *FlowsManager) DeleteOrg(orgId int) error {
	orgIdStr := strconv.Itoa(orgId)
	if _, ok := fm.Orgs.Load(orgIdStr); !ok {
		return common.ErrNotFound
	}

	fm.Orgs.Delete(orgIdStr)
	fm.DeleteOrgComponents(orgId)
	return nil
}

func (fm *FlowsManager) DeleteOrgComponents(orgId int) error {
	var groupsToDelete []int
	fm.Groups.Range(func(key, value interface{}) bool {
		if group, ok := value.(*common.Group); ok { // Asumiendo que value es *Group
			if group.OrgId == orgId {
				groupsToDelete = append(groupsToDelete, group.Id)
			}
		}
		return true
	})
	for _, groupId := range groupsToDelete {
		groupIdStr := strconv.Itoa(groupId)
		fm.Groups.Delete(groupIdStr)
	}

	var assetsToDelete []int
	fm.Assets.Range(func(key, value interface{}) bool {
		if asset, ok := value.(*common.Asset); ok { // Asumiendo que value es *Asset
			if asset.OrgId == orgId {
				assetsToDelete = append(assetsToDelete, asset.Id)
			}
		}
		return true
	})
	for _, assetId := range assetsToDelete {
		assetIdStr := strconv.Itoa(assetId)
		fm.Assets.Delete(assetIdStr)
	}

	var sensorsToDelete []int
	fm.Sensors.Range(func(key, value interface{}) bool {
		if sensor, ok := value.(*common.Sensor); ok { // Asumiendo que value es *Sensor
			if sensor.OrgId == orgId {
				sensorsToDelete = append(sensorsToDelete, sensor.Id)
			}
		}
		return true
	})
	for _, sensorId := range sensorsToDelete {
		sensorIdStr := strconv.Itoa(sensorId)
		fm.Sensors.Delete(sensorIdStr)
	}

	var mlModelsToDelete []int
	fm.MLModels.Range(func(key, value interface{}) bool {
		if mlModel, ok := value.(*common.MLModel); ok { // Asumindo que value es *MLModel
			if mlModel.OrgId == orgId {
				mlModelsToDelete = append(mlModelsToDelete, mlModel.Id)
			}
		}
		return true
	})
	for _, mlModelId := range mlModelsToDelete {
		mlModelIdStr := strconv.Itoa(mlModelId)
		fm.MLModels.Delete(mlModelIdStr)
	}

	var digitalTwinsToDelete []int
	fm.DigitalTwins.Range(func(key, value interface{}) bool {
		if digitalTwin, ok := value.(*common.DigitalTwin); ok { // Asumindo que value es *DigitalTwin
			if digitalTwin.OrgId == orgId {
				digitalTwinsToDelete = append(digitalTwinsToDelete, digitalTwin.Id)
			}
		}
		return true
	})
	for _, digitalTwinId := range digitalTwinsToDelete {
		fm.DeleteDigitalTwin(digitalTwinId)
	}

	return nil
}

func (fm *FlowsManager) UpdateOrg(org *common.Org) error {
	orgIdStr := strconv.Itoa(org.Id)
	if _, ok := fm.Orgs.Load(orgIdStr); ok {
		fm.Orgs.Store(orgIdStr, org)
		return nil
	}
	return common.ErrNotFound
}
