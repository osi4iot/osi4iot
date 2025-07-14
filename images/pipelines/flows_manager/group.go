package flows_manager

import (
	"pipelines/common"
	"strconv"
)

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
