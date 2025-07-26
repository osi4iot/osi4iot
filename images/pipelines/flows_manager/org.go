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

	var groupsToDelete []int
	fm.Groups.Range(func(key, value interface{}) bool {
		if group, ok := value.(*common.Group); ok { // Asumindo que value es *Group
			if group.OrgId == orgId {
				groupsToDelete = append(groupsToDelete, group.Id)
			}
		}
		return true
	})
	for _, groupId := range groupsToDelete {
		groupIdStr := strconv.Itoa(groupId)
		fm.Groups.Delete(groupIdStr)
		fm.DeleteGroup(groupId)
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
