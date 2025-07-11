package flows_manager

import (
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetMlModels() []*common.MLModel {
	var mlModels []*common.MLModel
	fm.MLModels.Range(func(key, value interface{}) bool {
		mlModels = append(mlModels, value.(*common.MLModel))
		return true
	})
	return mlModels
}

func (fm *FlowsManager) GetMlModel(modelId int) *common.MLModel {
	if model, ok := fm.MLModels.Load(strconv.Itoa(modelId)); ok {
		return model.(*common.MLModel)
	}
	return nil
}

func (fm *FlowsManager) AddMlModel(model *common.MLModel) {
	modelIdStr := strconv.Itoa(model.Id)
	if _, ok := fm.MLModels.Load(modelIdStr); !ok {
		fm.MLModels.Store(modelIdStr, model)
	} else {
		fm.log.Error("MLModel with ID %d already exists", model.Id)
	}
}
func (fm *FlowsManager) AddMlModels(models []*common.MLModel) {
	for _, model := range models {
		modelIdStr := strconv.Itoa(model.Id)
		if _, ok := fm.MLModels.Load(modelIdStr); !ok {
			fm.MLModels.Store(modelIdStr, model)
		} else {
			fm.log.Error("MLModel with ID %d already exists", model.Id)
		}
	}
}

func (fm *FlowsManager) DeleteMlModel(modelId int) error {
	modelIdStr := strconv.Itoa(modelId)
	if _, ok := fm.MLModels.Load(modelIdStr); ok {
		fm.MLModels.Delete(modelIdStr)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateMlModel(model *common.MLModel) error {
	modelIdStr := strconv.Itoa(model.Id)
	if _, ok := fm.MLModels.Load(modelIdStr); ok {
		fm.MLModels.Store(modelIdStr, model)
		return nil
	}
	return common.ErrNotFound
}