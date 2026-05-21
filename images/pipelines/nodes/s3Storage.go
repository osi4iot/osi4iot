package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"pipelines/common"
	"pipelines/duckdb"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/s3folder"
	"pipelines/utils"
	"slices"
	"time"

	_ "github.com/duckdb/duckdb-go/v2"
)

/* NOTE: To use ParamOptions="query_from_payload" the msg.Payload should contain a "s3Storage" field with the following structure:
	For Insert action:
	msg.payload.s3Storage =   {
       "action": "Insert",
	   "folder": "telemetry",
	   "rows": [...]
   	};

	For Read action:
	msg.payload.s3Storage =   {
       "action": "Read",
       "duckdbQuery": "SELECT * FROM s3_storage('telemetry') WHERE timestamp >= $__timeFun('now-1d/d') AND timestamp <= $__timeFun('now/d') ORDER BY timestamp DESC;",
	   "variables": {}
   };
*/

type S3StorageParams struct {
	Action        string
	OrgId         int
	AssetId       int
	GroupId       int
	GroupUid      string
	FolderName    string
	BucketName    string
	BucketPath    string
	ParquetSchema string
	DuckdbQuery   string
	Version       int
	Variables     map[string]any
}

type S3StorageNode struct {
	BaseNode
	QueryMode        string
	AvailableFolders map[string][]common.ParquetSchemaHistory
	Params           S3StorageParams
}

var posibleQueryModesForS3StorageNode = []string{
	"static_query",
	"query_from_payload",
}

var posibleActionsForS3StorageNode = []string{
	"Insert",
	"Read",
}

func CreateS3StorageNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*S3StorageNode, error) {
	queryMode, ok := node.Settings["queryMode"].(string)
	if !ok || !slices.Contains(posibleQueryModesForS3StorageNode, queryMode) {
		fm.Log().Errorf("S3StorageNode %s: invalid 'queryMode' setting", node.NodeUid)
		return nil, fmt.Errorf("invalid queryMode setting")
	}

	assetId := p.GetAssetId()
	availableAssetS3Folders := fm.GetAssetS3FolderByAssetId(assetId)
	availableFolders := make(map[string][]common.ParquetSchemaHistory)
	for _, f := range availableAssetS3Folders {
		availableFolders[f.FolderName] = f.SchemaHistory
	}

	var action, groupUid string
	var duckdbQuery string = ""

	group := fm.GetGroup(p.GetGroupId())
	groupUid = group.GroupUID
	orgId := group.OrgId
	groupId := group.Id

	bucketName := fm.GetS3BucketName()
	var folderName, parquetSchema, bucketPath string
	var version int

	if queryMode == "static_query" {
		action, ok = node.Settings["action"].(string)
		if !ok || !slices.Contains(posibleActionsForS3StorageNode, action) {
			fm.Log().Errorf("S3StorageNode %s: invalid 'action' setting", node.NodeUid)
			return nil, fmt.Errorf("invalid action setting")
		}

		folderName, ok = node.Settings["folderName"].(string)
		if !ok || folderName == "" {
			fm.Log().Errorf("S3StorageNode %s: 'folderName' setting is required", node.NodeUid)
			return nil, fmt.Errorf("folderName setting is required")
		}

		switch action {
		case "Read":
			duckdbQuery, ok = node.Settings["duckdbQuery"].(string)
			if !ok || duckdbQuery == "" {
				fm.Log().Errorf("S3StorageNode %s: 'duckdbQuery' setting is required for Read action", node.NodeUid)
				return nil, fmt.Errorf("duckdbQuery setting is required for Read action")
			}
			bucketPath = fmt.Sprintf("org_%d/group_%d/asset_%d", orgId, groupId, assetId)
		case "Insert":
			parquetHistory, exists := availableFolders[folderName]
			if !exists || len(parquetHistory) == 0 {
				fm.Log().Errorf("S3StorageNode %s: folder '%s' not found for asset %d", node.NodeUid, folderName, assetId)
				return nil, fmt.Errorf("folder '%s' not found for asset %d", folderName, assetId)
			}
			currentSchema := parquetHistory[len(parquetHistory)-1]
			parquetSchema = currentSchema.Schema
			version = currentSchema.Version
			bucketPath = fmt.Sprintf("org_%d/group_%d/asset_%d/folder=%s/version=%d", orgId, groupId, assetId, folderName, version)
		}
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &S3StorageNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "S3Storage",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		QueryMode:        queryMode,
		AvailableFolders: availableFolders,
		Params: S3StorageParams{
			Action:        action,
			OrgId:         orgId,
			AssetId:       assetId,
			GroupId:       groupId,
			GroupUid:      groupUid,
			FolderName:    folderName,
			ParquetSchema: parquetSchema,
			BucketPath:    bucketPath,
			Version:       version,
			DuckdbQuery:   duckdbQuery,
			BucketName:    bucketName,
		},
	}, nil
}

func (n *S3StorageNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("S3StorageNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting S3StorageNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *S3StorageNode) processMessage(msg common.Message, log *logger.Logger) error {
	var action string
	var params S3StorageParams
	var err error

	switch n.QueryMode {
	case "static_query":
		action = n.Params.Action
		params = n.Params
	case "query_from_payload":
		params, err = n.extractParamsFromPayload(msg)
		if err != nil {
			log.Errorf("Error extracting parameters from payload in S3StorageNode %s: %v", n.NodeUid, err)
			return fmt.Errorf("error extracting parameters from payload: %w", err)
		}
		action = params.Action
	default:
		log.Errorf("S3StorageNode %s: unknown queryMode '%s'", n.NodeUid, n.QueryMode)
		return fmt.Errorf("unknown queryMode '%s'", n.QueryMode)
	}

	switch action {
	case "Insert":
		return n.processInsertQuery(msg, params, log)
	case "Read":
		return n.processReadQuery(msg, params, log)
	default:
		log.Errorf("Unknown action '%s' for S3StorageNode %s", action, n.NodeUid)
		return fmt.Errorf("unknown action '%s'", action)
	}
}

func (n *S3StorageNode) processInsertQuery(msg common.Message, params S3StorageParams, log *logger.Logger) error {
	// 1. Extract rows from payload
	rows, err := n.extratsRowsFromPayload(msg)
	if err != nil {
		log.Errorf("Error extracting rows from payload in S3StorageNode %s: %v", n.NodeUid, err)
		return fmt.Errorf("error extracting rows from payload: %w", err)
	}

	// 2. Write temporary Parquet file
	now := time.Now().UTC()
	tmpFile := fmt.Sprintf("/tmp/%s_%d_%d.parquet", params.GroupUid, params.AssetId, now.Unix())
	if err := utils.WriteParquet(params.ParquetSchema, rows, tmpFile); err != nil {
		log.Errorf("Error writing Parquet file in S3StorageNode %s: %v", n.NodeUid, err)
		return fmt.Errorf("error writing parquet file: %w", err)
	}
	defer os.Remove(tmpFile)

	// 4. Upload to S3
	s3Key := fmt.Sprintf("%s/year=%d/month=%02d/day=%02d/%d.parquet",
		params.BucketPath,
		now.Year(),
		now.Month(),
		now.Day(),
		now.Unix(),
	)
	if err := utils.UploadFileToS3(n.Fm.GetS3Client(), params.BucketName, tmpFile, s3Key, log); err != nil {
		return fmt.Errorf("error uploading to S3: %w", err)
	}

	// 5. ← Sincronizar stats en Postgres
	var s3FolderRowID int
	for _, schema := range n.AvailableFolders[params.FolderName] {
		if schema.IsCurrent {
			s3FolderRowID = schema.S3FolderRowID
			break
		}
	}

	schemaJSON, err := json.Marshal(params.ParquetSchema)
	if err != nil {
		log.Warnf("S3StorageNode %s: no se pudo serializar el schema para sync: %v", n.NodeUid, err)
	} else {
		if err := s3folder.SyncS3Stats(
			n.Ctx,
			n.Fm.GetS3Client(), // *s3.Client
			params.BucketName,
			s3FolderRowID,
			int64(params.OrgId),
			int64(params.GroupId),
			int64(params.AssetId),
			params.FolderName,
			params.Version,
			schemaJSON,
			n.Fm.UpdateAssetS3FolderStatsById,
		); err != nil {
			log.Warnf("S3StorageNode %s: failed to sync S3 stats: %v", n.NodeUid, err)
		}
	}

	n.handleSuccessfullyInsertedQuery(msg, log)
	return nil
}

func (n *S3StorageNode) extratsRowsFromPayload(msg common.Message) ([]map[string]any, error) {
	s3StorageRaw, ok := msg.GetFieldFromPayload("s3Storage")
	if !ok {
		return nil, fmt.Errorf("payload does not contain 's3Storage' field")
	}

	s3Storage, ok := s3StorageRaw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("'s3Storage' field is not a valid map")
	}

	rowsRaw, ok := s3Storage["rows"]
	if !ok {
		return nil, fmt.Errorf("'s3Storage' does not contain 'rows' field")
	}

	rowsSlice, ok := rowsRaw.([]any)
	if !ok {
		return nil, fmt.Errorf("'rows' field is not a valid array")
	}

	rows := make([]map[string]any, 0, len(rowsSlice))
	for _, r := range rowsSlice {
		row, ok := r.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("row is not a valid map")
		}
		rows = append(rows, row)
	}

	return rows, nil
}

func (n *S3StorageNode) extractParamsFromPayload(msg common.Message) (S3StorageParams, error) {
	s3StorageRaw, ok := msg.GetFieldFromPayload("s3Storage")
	if !ok {
		return S3StorageParams{}, fmt.Errorf("payload does not contain 's3Storage' field")
	}

	s3Storage, ok := s3StorageRaw.(map[string]any)
	if !ok {
		return S3StorageParams{}, fmt.Errorf("'s3Storage' field is not a valid map")
	}

	action, ok := s3Storage["action"].(string)
	if !ok {
		return S3StorageParams{}, fmt.Errorf("'s3Storage' does not contain valid 'action' field")
	}

	variables, _ := s3Storage["variables"].(map[string]any)

	params := S3StorageParams{
		Action:     action,
		OrgId:      n.Params.OrgId,
		AssetId:    n.Params.AssetId,
		GroupUid:   n.Params.GroupUid,
		GroupId:    n.Params.GroupId,
		BucketName: n.Params.BucketName,
		Variables:  variables,
	}

	switch action {
	case "Read":
		duckdbQuery, ok := s3Storage["duckdbQuery"].(string)
		if !ok {
			return S3StorageParams{}, fmt.Errorf("'s3Storage' does not contain valid 'duckdbQuery' field for Read action")
		}
		bucketPath := fmt.Sprintf("org_%d/group_%d/asset_%d", n.Params.OrgId, n.Params.GroupId, n.Params.AssetId)
		if n.Params.OrgId == 0 || n.Params.GroupId == 0 || n.Params.AssetId == 0 {
			return S3StorageParams{}, fmt.Errorf("invalid IDs for bucket path: orgId=%d groupId=%d assetId=%d", n.Params.OrgId, n.Params.GroupId, n.Params.AssetId)
		}
		params.DuckdbQuery = duckdbQuery
		params.BucketPath = bucketPath
	case "Insert":
		folderName, ok := s3Storage["folder"].(string)
		if !ok {
			return S3StorageParams{}, fmt.Errorf("'s3Storage' does not contain valid 'folder' field")
		}
		params.FolderName = folderName

		parquetHistory, exists := n.AvailableFolders[folderName]
		if !exists || len(parquetHistory) == 0 {
			return S3StorageParams{}, fmt.Errorf("folder '%s' not found for asset %d", folderName, n.Params.AssetId)
		}
		currentSchema := parquetHistory[len(parquetHistory)-1]
		params.ParquetSchema = currentSchema.Schema
		params.Version = currentSchema.Version
		params.BucketPath = fmt.Sprintf("org_%d/group_%d/asset_%d/folder=%s/version=%d", n.Params.OrgId, n.Params.GroupId, n.Params.AssetId, folderName, currentSchema.Version)
	}

	return params, nil
}

func (n *S3StorageNode) processReadQuery(msg common.Message, params S3StorageParams, log *logger.Logger) error {
	sqlTemplate := duckdb.SQLTemplate{
		Query: params.DuckdbQuery,
		S3Config: duckdb.S3StorageConfig{
			BucketName:       params.BucketName,
			BucketPath:       params.BucketPath,
			OrgId:            params.OrgId,
			GroupId:          params.GroupId,
			AssetId:          params.AssetId,
			AvailableFolders: n.AvailableFolders,
		},
	}

	rows, cancelQueryCtx, err := duckdb.ParseAndExecuteSQL(n.Ctx, n.Fm.GetDuckdbPool(), sqlTemplate)
	if err != nil {
		log.Errorf("Error executing read query in S3StorageNode %s: %v", n.NodeUid, err)
		return fmt.Errorf("error executing read query: %w", err)
	}
	defer cancelQueryCtx()
	defer rows.Close()

	sqlResults, err := duckdb.RowsToMaps(rows)
	if err != nil {
		log.Errorf("Error processing rows in S3StorageNode %s: %v", n.NodeUid, err)
		return fmt.Errorf("error processing rows: %w", err)
	}

	payload := msg.GetPayload()
	payload["rows"] = sqlResults
	n.sendToOutputs(message.NewMessageFromPayload(payload), log)

	return nil
}

func (n *S3StorageNode) handleSuccessfullyInsertedQuery(msg common.Message, log *logger.Logger) {
	payload := msg.GetPayload()
	payload["message"] = "Data inserted successfully into S3 Storage"
	n.sendToOutputs(message.NewMessageFromPayload(payload), log)
}
