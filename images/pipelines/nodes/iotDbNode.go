package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"pipelines/common"
	"pipelines/iotdb"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"
	"slices"
	"strings"
	"time"
)

type IotDbParams struct {
	Action      string
	GroupUID    string
	TopicMap    map[string]*common.Topic
	InsertTopic string
	ReadQuery   string
	Variables   map[string]any
}

type SqlField struct {
	Action      string         `json:"action"`
	InsertTopic string         `json:"insertTopic"`
	ReadQuery   string         `json:"readQuery"`
	Variables   map[string]any `json:"variables"`
}

type IoTDbNode struct {
	BaseNode
	QueryMode string
	Params    IotDbParams
}

var posibleQueryModesForIotDbNode = []string{
	"static_query",
	"query_from_payload",
}

var posibleActionsForIotDbNode = []string{
	"Insert",
	"Read",
}

func CreateIoTDbNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*IoTDbNode, error) {
	queryMode, ok := node.Settings["queryMode"].(string)
	if !ok || !slices.Contains(posibleQueryModesForIotDbNode, queryMode) {
		fm.Log().Errorf("IoTDbNode %s: invalid 'queryMode' setting", node.NodeUid)
		return nil, fmt.Errorf("invalid queryMode setting")
	}

	var action, insertTopic, readQuery string
	var err error

	group := fm.GetGroup(p.GetGroupId())
	groupUid := group.GroupUID
	assetId := p.GetAssetId()
	topicMap := fm.GetTopicsByAssetId(assetId)

	if len(topicMap) == 0 {
		fm.Log().Errorf("IoTDbNode %s: no topics found for asset ID %d", node.NodeUid, assetId)
		return nil, fmt.Errorf("no topics found for asset ID %d", assetId)
	}

	if queryMode == "static_query" {
		action, ok = node.Settings["action"].(string)
		if !ok || !slices.Contains(posibleActionsForIotDbNode, action) {
			fm.Log().Errorf("IoTDbNode %s: invalid 'action' setting", node.NodeUid)
			return nil, fmt.Errorf("invalid action setting")
		}

		switch action {
		case "Read":
			rq, ok := node.Settings["sqlQuery"].(string)
			if !ok || rq == "" {
				fm.Log().Errorf("IoTDbNode %s: 'sqlQuery' setting is required for Read action", node.NodeUid)
				return nil, fmt.Errorf("sqlQuery setting is required for Read action")
			}
			tableName := fmt.Sprintf("iot_datasource.Table_%s", groupUid)
			readQuery, err = iotdb.ValidateAndResolveQuery(rq, tableName)
			if err != nil {
				fm.Log().Errorf("IoTDbNode %s: invalid sqlQuery: %v", node.NodeUid, err)
				return nil, fmt.Errorf("invalid sqlQuery: %w", err)
			}
		case "Insert":
			insertTopicRef, ok := node.Settings["insertTopicRef"].(string)
			if !ok || insertTopicRef == "" {
				fm.Log().Errorf("IoTDbNode %s: 'insertTopicRef' setting is required", node.NodeUid)
				return nil, fmt.Errorf("insertTopicRef setting is required")
			}
			insertTopic = utils.GetTopicByTopicRef(topicMap, insertTopicRef)
			if insertTopic == "" {
				fm.Log().Errorf("IoTDbNode %s: no topic found for insertTopicRef '%s'", node.NodeUid, insertTopicRef)
				return nil, fmt.Errorf("no topic found for insertTopicRef '%s'", insertTopicRef)
			}
		}
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &IoTDbNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "IoTDb",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		QueryMode: queryMode,
		Params: IotDbParams{
			Action:      action,
			GroupUID:    groupUid,
			TopicMap:    topicMap,
			InsertTopic: insertTopic,
			ReadQuery:   readQuery,
		},
	}, nil
}

func (n *IoTDbNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("IoTDbNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting IoTDbNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *IoTDbNode) processMessage(msg common.Message, log *logger.Logger) error {
	var action string
	var params IotDbParams

	switch n.QueryMode {
	case "static_query":
		action = n.Params.Action
		params = n.Params
		
	case "query_from_payload":
		sqlRaw, ok := msg.GetFieldFromPayload("sql")
		if !ok {
			log.Errorf("IoTDbNode %s: missing 'sql' in message payload", n.NodeUid)
			return fmt.Errorf("missing 'sql' in message payload")
		}

		jsonBytes, err := json.Marshal(sqlRaw)
		if err != nil {
			return fmt.Errorf("failed to marshal sql field: %w", err)
		}

		var sqlData SqlField
		if err := json.Unmarshal(jsonBytes, &sqlData); err != nil {
			return fmt.Errorf("failed to unmarshal sql field: %w", err)
		}

		if sqlData.Action == "Insert" && sqlData.InsertTopic == "" {
			log.Errorf("IoTDbNode %s: 'insertTopic' field in sql is empty", n.NodeUid)
			return fmt.Errorf("'insertTopic' field in sql is empty")
		}

		variables := make(map[string]any)
		var readQuery string
		if sqlData.Action == "Read" {
			maps.Copy(variables, sqlData.Variables)
			tableName := fmt.Sprintf("iot_datasource.Table_%s", n.Params.GroupUID)
			readQuery, err = iotdb.ValidateAndResolveQuery(sqlData.ReadQuery, tableName)
			if err != nil {
				log.Errorf("IoTDbNode %s: invalid readQuery: %v", n.NodeUid, err)
				return fmt.Errorf("invalid readQuery: %w", err)
			}
		}

		action = sqlData.Action
		params = IotDbParams{
			Action:      sqlData.Action,
			GroupUID:    n.Params.GroupUID,
			ReadQuery:   readQuery,
			TopicMap:    n.Params.TopicMap,
			InsertTopic: sqlData.InsertTopic,
			Variables:   variables,
		}

	default:
		log.Errorf("IoTDbNode %s: unknown queryMode '%s'", n.NodeUid, n.QueryMode)
		return fmt.Errorf("unknown queryMode '%s'", n.QueryMode)
	}

	switch action {
	case "Insert":
		return n.processInsertQuery(msg, params, log)
	case "Read":
		return n.processReadQuery(msg, params, log)
	default:
		log.Errorf("Unknown action '%s' for IoTDbNode %s", action, n.NodeUid)
		return fmt.Errorf("unknown action '%s'", action)
	}
}

func (n *IoTDbNode) processInsertQuery(msg common.Message, params IotDbParams, log *logger.Logger) error {
	if rows, ok := msg.GetPayload()["rows"].([]any); ok {
		for _, row := range rows {
			rowMap, ok := row.(map[string]any)
			if !ok {
				log.Errorf("Invalid message format in IoTDbNode %s: expected map[string]any", n.NodeUid)
				continue
			}
			if err := n.CreateAndSendRow(message.NewMessageFromPayload(rowMap), params, log); err != nil {
				log.Errorf("Error processing message in IoTDbNode %s: %v", n.NodeUid, err)
				return fmt.Errorf("error processing message: %w", err)
			}
		}
	} else {
		if err := n.CreateAndSendRow(msg, params, log); err != nil {
			log.Errorf("Error processing message in IoTDbNode %s: %v", n.NodeUid, err)
			return fmt.Errorf("error processing message: %w", err)
		}
	}

	n.handleSuccessfullyInsertedQuery(msg, log)
	return nil
}

func (n *IoTDbNode) processReadQuery(msg common.Message, params IotDbParams, log *logger.Logger) error {
	sqlTemplate := iotdb.SQLTemplate{
		Query:     params.ReadQuery,
		TopicMap:  params.TopicMap,
		Variables: params.Variables,
	}

	rows, err := iotdb.ParseAndExecuteSQL(n.Ctx, n.Fm.GetDbPool(), sqlTemplate)
	if err != nil {
		log.Errorf("Error executing read query in IoTDbNode %s: %v", n.NodeUid, err)
		return fmt.Errorf("error executing read query: %w", err)
	}
	defer rows.Close()

	var sqlResults []map[string]any
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			log.Errorf("Error reading row values in IoTDbNode %s: %v", n.NodeUid, err)
			continue
		}
		rowMap := make(map[string]any, len(rows.FieldDescriptions()))
		for i, field := range rows.FieldDescriptions() {
			rowMap[string(field.Name)] = values[i]
		}
		sqlResults = append(sqlResults, rowMap)
	}

	payload := msg.GetPayload()
	payload["rows"] = sqlResults
	n.sendToOutputs(message.NewMessageFromPayload(payload), log)

	return nil
}

var internalPayloadKeys = map[string]struct{}{
    "sql":                   {},
    "eventTriggerTopicType": {},
    "timestamp":             {},
}

func (n *IoTDbNode) CreateAndSendRow(msg common.Message, params IotDbParams, log *logger.Logger) error {
    var timestamp time.Time
    var err error

    if ts, ok := msg.GetStringFromPayload("timestamp"); ok {
        timestamp, err = time.Parse(time.RFC3339, ts)
        if err != nil {
            return fmt.Errorf("failed to parse timestamp for node %s: %w", n.NodeUid, err)
        }
    } else {
        timestamp = time.Now()
    }

	// Filter internal keys before persisting
    payload := msg.GetPayload()
    filtered := make(map[string]any, len(payload))
    for k, v := range payload {
        if _, excluded := internalPayloadKeys[k]; !excluded {
            filtered[k] = v
        }
    }

    payloadBytes, err := json.Marshal(filtered)
    if err != nil {
        return fmt.Errorf("failed to marshal message for node %s: %w", n.NodeUid, err)
    }

    topicUid := strings.Split(params.InsertTopic, "_")[1]
    n.Fm.SendToIotDataChannel(common.ThingData{
        GroupUID:  params.GroupUID,
        TopicUID:  topicUid,
        Topic:     params.InsertTopic,
        Payload:   payloadBytes,
        Timestamp: timestamp,
        Deleted:   0,
    })

    return nil
}

func (n *IoTDbNode) handleSuccessfullyInsertedQuery(msg common.Message, log *logger.Logger) {
	payload := msg.GetPayload()
	payload["message"] = "Data inserted successfully into IoT DB"
	n.sendToOutputs(message.NewMessageFromPayload(payload), log)
}