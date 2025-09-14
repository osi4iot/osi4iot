package flows_manager

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"pipelines/common"
	"pipelines/utils"
	"regexp"
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
			mlModelFolder := fm.GetMlModelFolder(model.OrgId, model.GroupId, model.Id)
			fileName := fm.DownloadMlModelFile(mlModelFolder, model.GroupId, model.Id)
			model.FileName = fileName
			fm.MLModels.Store(modelIdStr, model)
		} else {
			fm.log.Error("MLModel with ID %d already exists", model.Id)
		}
	}

	fm.DeleteOldMlModelFiles(models)
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

func (fm *FlowsManager) GetS3MlModelFolderInfo(groupId int, mlModelId int) []*common.S3FolderFileInfo {
	return fm.Admin.GetS3MlModelFolderInfo(groupId, mlModelId)
}

func (fm *FlowsManager) GetMlModelFile(groupId int, mlModelId int) error {
	mlModel := fm.Admin.GetMlModel(groupId, mlModelId)
	if mlModel == nil {
		fm.log.Errorf("Machine learning model with id: %d does not exist", mlModelId)
		return common.ErrNotFound
	}
	mlModelFolder := fm.GetMlModelFolder(mlModel.OrgId, mlModel.GroupId, mlModel.Id)
	fileName := fm.DownloadMlModelFile(mlModelFolder, mlModel.GroupId, mlModel.Id)
	mlModel.FileName = fileName
	modelIdStr := strconv.Itoa(mlModel.Id)
	fm.MLModels.Store(modelIdStr, mlModel)
	return nil
}


func (fm *FlowsManager) DeleteOldMlModelFiles(models []*common.MLModel) error {
	if fm.PipelinesDataPath == "" {
		fm.log.Error("PipelinesDataPath is not set")
		return nil
	}

	modelFolders, err := fm.GetModelFolders(fm.PipelinesDataPath)
	if err != nil {
		fm.log.Errorf("Failed to get ML model folders: %v", err)
		return err
	}

	modelFoldersToDelete := make([]common.MlModelFolder, 0)
	for _, folder := range modelFolders {
		found := false
		for _, model := range models {
			if model.Id == folder.MlModelId {
				found = true
				break
			}
		}
		if !found {
			modelFoldersToDelete = append(modelFoldersToDelete, folder)
		}
	}

	deleteError := error(nil)
	for _, folder := range modelFoldersToDelete {
		if err := utils.DeleteFolder(folder.Path); err != nil {
			newErr := fmt.Errorf("failed to delete ML model folder %s: %v", folder.Path, err)
			deleteError = fmt.Errorf("%w; %v", deleteError, newErr)
		}
	}

	if deleteError != nil {
		fm.log.Errorf("Failed to delete old ML model folders: %v", deleteError)
	}

	return deleteError
}

func (fm *FlowsManager) GetModelFolders(rootPath string) ([]common.MlModelFolder, error) {
	var modelFolders []common.MlModelFolder

	pattern := regexp.MustCompile(`[/\\]org_(\d+)[/\\]group_(\d+)[/\\]ml_models[/\\]model_(\d+)$`)

	err := filepath.WalkDir(rootPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			fm.log.Errorf("error accessing to %s: %v\n", path, err)
			return nil
		}

		if d.IsDir() {
			normalizedPath := filepath.ToSlash(path)

			matches := pattern.FindStringSubmatch(normalizedPath)
			if len(matches) == 4 {
				orgID, _ := strconv.Atoi(matches[1])
				groupID, _ := strconv.Atoi(matches[2])
				modelID, _ := strconv.Atoi(matches[3])

				modelFolders = append(modelFolders, common.MlModelFolder{
					Path:      path,
					OrgId:     orgID,
					GroupId:   groupID,
					MlModelId: modelID,
				})
			}
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("error getting model folders: %w", err)
	}

	return modelFolders, nil
}

func (fm *FlowsManager) DownloadMlModelFile(mlModelFolder string, groupId int, mlModelId int) string {
	return fm.Admin.DownloadMlModelFile(mlModelFolder, groupId, mlModelId)
}
