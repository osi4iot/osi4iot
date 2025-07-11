package flows_manager

import (
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetGroups() []*common.Group {
	var groups []*common.Group
	fm.Groups.Range(func(key, value interface{}) bool {
		groups = append(groups, value.(*common.Group))
		return true
	})
	return groups
}

func (fm *FlowsManager) GetGroup(groupId int) *common.Group {
	groupIdStr := strconv.Itoa(groupId)
	if group, ok := fm.Groups.Load(groupIdStr); ok {
		return group.(*common.Group)
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

func (fm *FlowsManager) DeleteGroup(groupId int) error {
	groupIdStr := strconv.Itoa(groupId)
	if _, ok := fm.Groups.Load(groupIdStr); ok {
		fm.Groups.Delete(groupIdStr)

		for _, asset := range fm.GetAssets() {
			if asset.GroupId == groupId {
				fm.DeleteAsset(asset.Id)
			}
		}

		for _, sensor := range fm.GetSensors() {
			if sensor.GroupId == groupId {
				fm.DeleteSensor(sensor.Id)
			}
		}

		for _, model := range fm.GetMlModels() {
			if model.GroupId == groupId {
				fm.DeleteMlModel(model.Id)
			}
		}

		for _, topic := range fm.GetTopics() {
			if topic.GroupId == groupId {
				fm.DeleteTopic(topic.Id)
			}
		}

		for _, digitalTwin := range fm.GetDigitalTwins() {
			if digitalTwin.GroupId == groupId {
				fm.DeleteDigitalTwin(digitalTwin.Id)
			}
		}

		for _, node := range fm.GetNodes() {
			if (*node).GetGroupId() == groupId {
				fm.DeleteNode((*node).GetId())
			}
		}

		for _, wire := range fm.GetWires() {
			if wire.GroupId == groupId {
				fm.DeleteWire(wire.Id)
			}
		}

		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateGroup(group *common.Group) error {
	groupIdStr := strconv.Itoa(group.Id)
	if _, ok := fm.Groups.Load(groupIdStr); ok {
		fm.Groups.Store(groupIdStr, group)
		return nil
	}
	return common.ErrNotFound
}
