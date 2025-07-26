package flows_manager

import (
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetGroups() []*common.Group {
	var groups []*common.Group
	fm.Groups.Range(func(key, value interface{}) bool {
		if group, ok := value.(*common.Group); ok {
			groups = append(groups, group)
		}
		return true
	})
	return groups
}

func (fm *FlowsManager) GetGroup(groupId int) *common.Group {
	groupIdStr := strconv.Itoa(groupId)
	if group, ok := fm.Groups.Load(groupIdStr); ok {
		return group.(*common.Group)
	} else {
		fm.log.Error("Group with ID %d not found", groupId)
	}
	return nil
}

func (fm *FlowsManager) AddGroup(group *common.Group) {
	groupIdStr := strconv.Itoa(group.Id)
	if _, ok := fm.Groups.Load(groupIdStr); !ok {
		fm.Groups.Store(groupIdStr, group)
	} else {
		fm.log.Error("Group with ID %d already exists", group.Id)
	}
}

func (fm *FlowsManager) AddGroups(groups []*common.Group) {
	for _, group := range groups {
		groupIdStr := strconv.Itoa(group.Id)
		if _, ok := fm.Groups.Load(groupIdStr); !ok {
			fm.Groups.Store(groupIdStr, group)
		} else {
			fm.log.Error("Group with ID %d already exists", group.Id)
		}
	}
}

func (fm *FlowsManager) UpdateGroup(group *common.Group) error {
	groupIdStr := strconv.Itoa(group.Id)
	if _, ok := fm.Groups.Load(groupIdStr); ok {
		fm.Groups.Store(groupIdStr, group)
		return nil
	} else {
		fm.log.Error("Group with ID %d not found", group.Id)
		return common.ErrNotFound
	}
}

func (fm *FlowsManager) DeleteGroup(groupId int) error {
	var mlModelsToDelete []int
	fm.MLModels.Range(func(key, value interface{}) bool {
		if mlModel, ok := value.(*common.MLModel); ok { // Asumindo que value es *MLModel
			if mlModel.GroupId == groupId {
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
			if digitalTwin.GroupId == groupId {
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
