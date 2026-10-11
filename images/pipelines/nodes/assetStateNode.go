package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/iotdb"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"
	"slices"
)

/* NOTE: To use ParamOptions="state_from_payload" the msg.Payload should contain a "state" field
with a JSON object with the same structure as the CustomState field in the AssetStateNode struct. For example:
*/

type AssetStateNode struct {
	BaseNode
	StoreType    string
	Action       string
	SetStateMode string
	CustomState  map[string]any
	GroupUid     string
	AssetUid     string
}

var posiblesStoreTypesForAssetStateNode = []string{
	"IoTDB",
	"key_value_store",
}

var posibleStateModesForAssetStateNode = []string{
	"custom_state",
	"state_from_payload",
}

var posibleActionsForAssetStateNode = []string{
	"Set or update state of current asset",
	"Get state of current asset",
	"Get states of assets in current group",
}

func CreateAssetStateNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*AssetStateNode, error) {
	storeType, ok := node.Settings["storeType"].(string)
	if !ok || !slices.Contains(posiblesStoreTypesForAssetStateNode, storeType) {
		fm.Log().Errorf("AssetStateNode %s: invalid 'storeType' setting", node.NodeUid)
		return nil, fmt.Errorf("invalid storeType setting")
	}

	action, ok := node.Settings["action"].(string)
	if !ok || !slices.Contains(posibleActionsForAssetStateNode, action) {
		fm.Log().Errorf("AssetStateNode %s: invalid 'action' setting", node.NodeUid)
		return nil, fmt.Errorf("invalid action setting")
	}

	setStateMode, ok := node.Settings["setStateMode"].(string)
	if !ok || !slices.Contains(posibleStateModesForAssetStateNode, setStateMode) {
		fm.Log().Errorf("AssetStateNode %s: invalid 'setStateMode' setting", node.NodeUid)
		return nil, fmt.Errorf("invalid setStateMode setting")
	}

	group := fm.GetGroup(p.GetGroupId())
	groupUid := group.GroupUID
	assetId := p.GetAssetId()
	asset := fm.GetAssetById(assetId)
	assetUid := asset.AssetUid
	var customState map[string]any = make(map[string]any)

	if action == "Set or update state of current asset" && setStateMode == "custom_state" {
		if err := json.Unmarshal([]byte(node.Settings["customState"].(string)), &customState); err != nil {
			fm.Log().Errorf("AssetStateNode %s: failed to unmarshal json: %w", node.NodeUid, err)
			return nil, fmt.Errorf("failed to unmarshal jsonSchema: %w", err)
		}
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &AssetStateNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "AssetState",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		StoreType:    storeType,
		Action:       action,
		SetStateMode: setStateMode,
		CustomState:  customState,
		GroupUid:     groupUid,
		AssetUid:     assetUid,
	}, nil
}

func (n *AssetStateNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("AssetStateNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
    n.Ctx = nodectx
    n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting AssetStateNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *AssetStateNode) processMessage(msg common.Message, log *logger.Logger) error {

	switch n.Action {
	case "Set or update state of current asset":
		return n.processUpsertQuery(msg, log)
	case "Get state of current asset":
		return n.processGetStateQuery(msg, log)
	case "Get states of assets in current group":
		return n.processGetStatesInGroupQuery(msg, log)
	default:
		log.Errorf("Unknown action '%s' for AssetStateNode %s", n.Action, n.NodeUid)
		return fmt.Errorf("unknown action '%s'", n.Action)
	}
}

func (n *AssetStateNode) processUpsertQuery(msg common.Message, log *logger.Logger) error {
	var state map[string]any
	var ok bool
	switch n.SetStateMode {
	case "state_from_payload":
		state, ok = msg.GetMapFromPayload("state")
		if !ok {
			log.Errorf("AssetStateNode %s: 'state' field missing or invalid in payload", n.NodeUid)
			return fmt.Errorf("'state' field missing or invalid in payload")
		}
		n.CustomState = state
	case "custom_state":
		state = n.CustomState
	}

	assetState := iotdb.AssetState{
		GroupUid: n.GroupUid,
		AssetUid: n.AssetUid,
		State:    state,
	}

	switch n.StoreType {
	case "IoTDB":
		err := iotdb.UpsertAssetState(n.Ctx, n.Fm.GetDbPool(), assetState)
		if err != nil {
			log.Errorf("AssetStateNode %s: failed to upsert asset state: %v", n.NodeUid, err)
			return fmt.Errorf("failed to upsert asset state: %w", err)
		}
		var payload map[string]any = make(map[string]any)
		payload["message"] = fmt.Sprintf("State for asset %s upserted successfully in IoT DB", n.AssetUid)

		responseMsg := message.NewMessageFromPayload(payload)
		n.sendToOutputs(responseMsg, log)
	case "key_value_store":
		kvKey := n.GetAssetStateKvStoreKey(n.AssetUid, n.GroupUid)
		kvStore, err := n.GetGroupKvStore(n.Pipeline.GetGroupId())
		if err != nil {
			log.Errorf("AssetStateNode %s: failed to get KV store: %v", n.NodeUid, err)
			return fmt.Errorf("failed to get KV store: %w", err)
		}
		err = kvStore.SetValue(n.Ctx, kvKey, state)
		if err != nil {
			log.Errorf("Error setting value in store for key %s: %v", kvKey, err)
			return fmt.Errorf("error setting value in store for key %s: %w", kvKey, err)
		}

		var payload map[string]any = make(map[string]any)
		payload["message"] = fmt.Sprintf("State for asset %s upserted successfully in KV store", n.AssetUid)

		responseMsg := message.NewMessageFromPayload(payload)
		n.sendToOutputs(responseMsg, log)
	}

	return nil
}

func (n *AssetStateNode) processGetStateQuery(msg common.Message, log *logger.Logger) error {
	var assetState map[string]any
	var err error

	switch n.StoreType {
	case "IoTDB":
		assetState, err = iotdb.GetStateFromAssetState(n.Ctx, n.Fm.GetDbReadPool(), n.GroupUid, n.AssetUid)
		if err != nil {
			log.Errorf("AssetStateNode %s: failed to get asset state: %v", n.NodeUid, err)
			return fmt.Errorf("failed to get asset state: %w", err)
		}
	case "key_value_store":
		assetState, err = n.GetAssetStateFromGroupKvStore(n.AssetUid, n.GroupUid)
		if err != nil {
			log.Errorf("Error getting asset state from KV store for asset %s in group %s: %v", n.AssetUid, n.GroupUid, err)
			return fmt.Errorf("error getting asset state from KV store for asset %s in group %s: %w", n.AssetUid, n.GroupUid, err)
		}
	}

	// Ensure the "status" field is always present in the output state
	// If it is not present in the retrieved state, set it to "Unknown"
	if _, ok := assetState["status"]; !ok {
		assetState["status"] = "Unknown"
	}

	assetStateDescription := common.DefaultAssetStateDescription
	if desc, ok := assetState["state_description"].(string); ok {
		assetStateDescription = desc
	}

	payload := msg.GetPayload()
	payload["state"] = assetState
	payload["state_description"] = assetStateDescription

	resultMsg := message.NewMessageFromPayload(payload)

	n.sendToOutputs(resultMsg, log)

	return nil
}

func (n *AssetStateNode) processGetStatesInGroupQuery(msg common.Message, log *logger.Logger) error {
	var assetStates map[string]map[string]any
	var err error

	switch n.StoreType {
	case "IoTDB":
		assetStates, err = iotdb.GetAssetStatesByGroup(n.Ctx, n.Fm.GetDbReadPool(), n.GroupUid)
		if err != nil {
			log.Errorf("AssetStateNode %s: failed to get asset states in group: %v", n.NodeUid, err)
			return fmt.Errorf("failed to get asset states in group: %w", err)
		}
	case "key_value_store":
		assetStates, err = n.GetAssetStatesInGroupFromGroupKvStore(n.GroupUid, log)
		if err != nil {
			log.Errorf("Error getting asset states from KV store for group %s: %v", n.GroupUid, err)
			return fmt.Errorf("error getting asset states from KV store for group %s: %w", n.GroupUid, err)
		}
	}

	for _, state := range assetStates {
		// Ensure the "status" field is always present in the output state
		// If it is not present in the retrieved state, set it to "Unknown"
		if _, ok := state["status"]; !ok {
			state["status"] = "Unknown"
		}

		// Ensure the "state_description" field is always present in the output state
		// If it is not present in the retrieved state, set it to a default message
		if _, ok := state["state_description"]; !ok {
			state["state_description"] = common.DefaultAssetStateDescription
		}
	}

	payload := msg.GetPayload()
	payload["assetStates"] = assetStates
	resultMsg := message.NewMessageFromPayload(payload)

	n.sendToOutputs(resultMsg, log)

	return nil
}
