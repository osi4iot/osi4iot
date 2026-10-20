package flows_manager

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/utils"
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

// AddMlModels registers the models. Their .onnx files are not
// downloaded: each MlModel node reads its model from the bucket into
// memory when it starts (GetMlModelData).
func (fm *FlowsManager) AddMlModels(ctx context.Context, models []*common.MLModel) {
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

func (fm *FlowsManager) GetS3MlModelFolderInfo(ctx context.Context, groupId int, mlModelId int) []*common.S3FolderFileInfo {
	return fm.Admin.GetS3MlModelFolderInfo(ctx, groupId, mlModelId)
}

// GetMlModelFile handles a new .onnx file uploaded for a model: it only
// refreshes the model's record. The file itself is read from the bucket
// by the MlModel nodes when they start, so a node picks up the new file
// on its next (re)start.
func (fm *FlowsManager) GetMlModelFile(ctx context.Context, groupId int, mlModelId int) error {
	mlModel := fm.Admin.GetMlModel(ctx, groupId, mlModelId)
	if mlModel == nil {
		fm.log.Errorf("Machine learning model with id: %d does not exist", mlModelId)
		return common.ErrNotFound
	}
	fm.MLModels.Store(strconv.Itoa(mlModel.Id), mlModel)
	return nil
}

// mlModelS3Prefix is where admin_api stores a model's file(s).
func mlModelS3Prefix(orgId, groupId, mlModelId int) string {
	return fmt.Sprintf("org_data/org_%d/group_%d/ml_models/ml_model_%d/", orgId, groupId, mlModelId)
}

// GetMlModelData reads a model's .onnx file from the bucket into memory:
// the most recent object in its folder, as admin_api lists it.
func (fm *FlowsManager) GetMlModelData(ctx context.Context, orgId int, groupId int, mlModelId int) ([]byte, error) {
	if fm.S3Client == nil || fm.S3BucketName == "" {
		return nil, fmt.Errorf("no S3 client")
	}
	prefix := mlModelS3Prefix(orgId, groupId, mlModelId)
	key, err := utils.NewestS3Object(ctx, fm.S3Client, fm.S3BucketName, prefix)
	if err != nil {
		return nil, err
	}
	if key == "" {
		return nil, fmt.Errorf("no model file in s3://%s/%s", fm.S3BucketName, prefix)
	}
	data, found, err := utils.GetS3Object(ctx, fm.S3Client, fm.S3BucketName, key)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("s3://%s/%s disappeared while reading it", fm.S3BucketName, key)
	}
	fm.log.Infof("ML model %d read from s3://%s/%s (%d bytes)", mlModelId, fm.S3BucketName, key, len(data))
	return data, nil
}
