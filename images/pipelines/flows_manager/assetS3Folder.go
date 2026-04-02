package flows_manager

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/utils"
	"time"
)

func (fm *FlowsManager) GetAssetS3Folders() []*common.AssetS3Folder {
	var assetS3Folders []*common.AssetS3Folder
	fm.AssetS3Folders.Range(func(key, value interface{}) bool {
		assetS3Folders = append(assetS3Folders, value.(*common.AssetS3Folder))
		return true
	})
	return assetS3Folders
}

func (fm *FlowsManager) GetAssetS3Folder(assetId int, folderName string) *common.AssetS3Folder {
	assetS3FolderKey := makeAssetS3FolderKey(assetId, folderName)
	if assetS3Folder, ok := fm.AssetS3Folders.Load(assetS3FolderKey); ok {
		return assetS3Folder.(*common.AssetS3Folder)
	}
	return nil
}

func (fm *FlowsManager) AddAssetS3Folder(ctx context.Context, assetS3Folder *common.AssetS3Folder) {
	assetS3FolderKey := makeAssetS3FolderKey(assetS3Folder.AssetId, assetS3Folder.FolderName)

	value, ok := fm.AssetS3Folders.Load(assetS3FolderKey)
	if !ok {
		fm.AssetS3Folders.Store(assetS3FolderKey, assetS3Folder)
		fm.UpdateAssetS3FolderHistory(assetS3Folder, assetS3Folder)
		return
	}

	existing := value.(*common.AssetS3Folder)
	if !common.SchemasAreEqual(existing.ParquetSchema, assetS3Folder.ParquetSchema) {
		fm.UpdateAssetS3FolderHistory(existing, assetS3Folder)

		existing.ParquetSchema = assetS3Folder.ParquetSchema
		existing.ValidFrom = assetS3Folder.ValidFrom
		existing.ValidTo = assetS3Folder.ValidTo
		existing.Version = assetS3Folder.Version
		existing.IsCurrent = assetS3Folder.IsCurrent
		existing.Updated = assetS3Folder.Updated

		fm.AssetS3Folders.Store(assetS3FolderKey, existing)
		fm.log.Infof("Schema updated for key %s (version %d)", assetS3FolderKey, existing.Version)
	} else {
		fm.log.Infof("Schema unchanged for key %s, skipping history entry", assetS3FolderKey)
	}
}

func (fm *FlowsManager) UpdateAssetS3Folder(ctx context.Context, assetS3Folder *common.AssetS3Folder) {
	assetS3FolderKey := makeAssetS3FolderKey(assetS3Folder.AssetId, assetS3Folder.FolderName)
	value, ok := fm.AssetS3Folders.Load(assetS3FolderKey)
	if ok {
		existing := value.(*common.AssetS3Folder)
		existing.LastS3Storage = assetS3Folder.LastS3Storage
		existing.ParquetFileCount = assetS3Folder.ParquetFileCount
		existing.ParquetTotalBytes = assetS3Folder.ParquetTotalBytes
		existing.Updated = assetS3Folder.Updated
		fm.AssetS3Folders.Store(assetS3FolderKey, existing)
		fm.log.Infof("Asset S3 Folder updated for key %s", assetS3FolderKey)
	}
}

func (fm *FlowsManager) AddAssetS3Folders(ctx context.Context, assetS3Folders []*common.AssetS3Folder) {
	for _, assetS3Folder := range assetS3Folders {
		fm.AddAssetS3Folder(ctx, assetS3Folder)
	}
}

func (fm *FlowsManager) DeleteAssetS3Folder(ctx context.Context, assetId int, folderName string) error {
	assetS3FolderKey := makeAssetS3FolderKey(assetId, folderName)
	if _, ok := fm.AssetS3Folders.Load(assetS3FolderKey); ok {
		fm.AssetS3Folders.Delete(assetS3FolderKey)
		return nil
	}
	return fmt.Errorf("Asset S3 Folder with key %s not found", assetS3FolderKey)
}

func makeAssetS3FolderKey(assetId int, folderName string) string {
	return fmt.Sprintf("asset:%d:folder:%s", assetId, folderName)
}

func (fm *FlowsManager) UpdateAssetS3FolderHistory(current *common.AssetS3Folder, incoming *common.AssetS3Folder) {
	validFrom, err := utils.ParseTimestamp(incoming.ValidFrom)
	if err != nil {
		fm.log.Errorf("Error parsing ValidFrom timestamp: %v", err)
		return
	}

	validTo := time.Time{}
	if incoming.ValidTo != "" {
		validTo, err = utils.ParseTimestamp(incoming.ValidTo)
		if err != nil {
			fm.log.Errorf("Error parsing ValidTo timestamp: %v", err)
			return
		}
	}

	// Cerramos la última entrada del historial con el ValidFrom del incoming
	if len(current.SchemaHistory) > 0 {
		incomingValidFrom, err := utils.ParseTimestamp(incoming.ValidFrom)
		if err != nil {
			fm.log.Errorf("Error parsing incoming ValidFrom timestamp: %v", err)
			return
		}
		current.SchemaHistory[len(current.SchemaHistory)-1].ValidTo = incomingValidFrom
		current.SchemaHistory[len(current.SchemaHistory)-1].IsCurrent = false
	}

	parquetSchema, err := utils.GetParquetSchemaFromMap(incoming.ParquetSchema)
	if err != nil {
		fm.log.Errorf("Error converting Parquet schema: %v", err)
		return
	}

	entry := common.ParquetSchemaHistory{
		S3FolderRowID: incoming.Id,
		Schema:        parquetSchema,
		ValidFrom:     validFrom,
		ValidTo:       validTo,
		Version:       incoming.Version,
		IsCurrent:     incoming.IsCurrent,
	}
	current.SchemaHistory = append(current.SchemaHistory, entry)
}

func (fm *FlowsManager) GetAssetS3FolderSchemaAtVersion(assetId int, folderName string, version int) *common.ParquetSchemaHistory {
	assetS3FolderKey := makeAssetS3FolderKey(assetId, folderName)
	if assetS3Folder, ok := fm.AssetS3Folders.Load(assetS3FolderKey); ok {
		a := assetS3Folder.(*common.AssetS3Folder)
		for _, h := range a.SchemaHistory {
			if h.Version == version {
				return &h
			}
		}
	}
	return nil
}

func (fm *FlowsManager) GetAssetS3FolderByAssetId(assetId int) []*common.AssetS3Folder {
	var assetS3Folders []*common.AssetS3Folder
	fm.AssetS3Folders.Range(func(key, value interface{}) bool {
		assetS3Folder := value.(*common.AssetS3Folder)
		if assetS3Folder.AssetId == assetId {
			assetS3Folders = append(assetS3Folders, assetS3Folder)
		}
		return true
	})

	return assetS3Folders
}

func (fm *FlowsManager) UpdateAssetS3FolderStatsById(
	ctx context.Context,
	groupId int,
	assetId int,
	folderName string,
	stats common.S3FolderStats,
) error {
	return fm.Admin.UpdateAssetS3FolderStatsById(ctx, groupId, assetId, folderName, stats)
}
