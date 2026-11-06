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

// AssetStateNode sets and reads the states of the assets in the IoT DB
// (patroni_metrics, iot_data.assetState), where the TelegramListen node
// reads them too. Nodes saved with the former "storeType" setting keep
// working: the setting is ignored ("key_value_store" with a warning, since
// its states are no longer read).
type AssetStateNode struct {
	BaseNode
	Action       string
	SetStateMode string
	CustomState  map[string]any
	GroupUid     string
	AssetUid     string
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
	if storeType, _ := node.Settings["storeType"].(string); storeType == "key_value_store" {
		fm.Log().Warnf("AssetStateNode %s: the key-value store is no longer used for asset states: the IoT DB is used", node.NodeUid)
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
	if group == nil {
		fm.Log().Errorf("AssetStateNode %s: the digital twin's group %d was not found", node.NodeUid, p.GetGroupId())
		return nil, fmt.Errorf("the digital twin's group was not found")
	}
	groupUid := group.GroupUID
	assetId := p.GetAssetId()
	asset := fm.GetOrLoadAsset(context.Background(), p.GetGroupId(), assetId)
	if asset == nil {
		fm.Log().Errorf("AssetStateNode %s: the digital twin's asset %d was not found", node.NodeUid, assetId)
		return nil, fmt.Errorf("the digital twin's asset was not found")
	}
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

	pool := n.Fm.GetDbPool()
	if pool == nil {
		log.Errorf("AssetStateNode %s: the IoT DB is not available", n.NodeUid)
		return fmt.Errorf("the IoT DB is not available")
	}

	// The status before, to say when it changes (only read if someone listens)
	previousStatus := ""
	listening := len(n.GetNodeOutputWires()) > 0
	if listening {
		if previous, err := n.GetAssetState(n.AssetUid, n.GroupUid); err == nil {
			previousStatus = statusOf(previous)
		} else {
			log.Warnf("AssetStateNode %s: reading the previous state: %v", n.NodeUid, err)
		}
	}

	if err := iotdb.UpsertAssetState(n.Ctx, pool, assetState); err != nil {
		log.Errorf("AssetStateNode %s: failed to upsert asset state: %v", n.NodeUid, err)
		return fmt.Errorf("failed to upsert asset state: %w", err)
	}

	// Output: only when the status changed, so that Email or Telegram nodes
	// can be told of it whoever sets the state.
	status := statusOf(state)
	if !listening || previousStatus == "" || status == previousStatus {
		return nil
	}
	description, _ := state["state_description"].(string)
	text := fmt.Sprintf("%s: %s → %s", n.assetName(), previousStatus, status)
	if description != "" {
		text += " (" + description + ")"
	}
	payload := map[string]any{
		"assetUid":          n.AssetUid,
		"status":            status,
		"previousStatus":    previousStatus,
		"state_description": description,
		"state":             state,
		"message":           text,
	}
	out := message.NewMessage(msg.GetTopic(), payload, msg.GetState(), "", nil)
	out.SetReplyContext(msg.GetReplyContext())
	common.InheritSender(msg, out)
	n.sendToOutputs(out, log)
	return nil
}

// statusOf is the status of a state ("Unknown" without one).
func statusOf(state map[string]any) string {
	if s, ok := state["status"].(string); ok && s != "" {
		return s
	}
	return "Unknown"
}

// assetName is how the asset is called in the messages.
func (n *AssetStateNode) assetName() string {
	if asset := n.Fm.GetAssetById(n.Pipeline.GetAssetId()); asset != nil && asset.Description != "" {
		return asset.Description
	}
	return "Asset " + n.AssetUid
}

func (n *AssetStateNode) processGetStateQuery(msg common.Message, log *logger.Logger) error {
	assetState, err := n.GetAssetState(n.AssetUid, n.GroupUid)
	if err != nil {
		log.Errorf("AssetStateNode %s: failed to get asset state: %v", n.NodeUid, err)
		return fmt.Errorf("failed to get asset state: %w", err)
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

	// the same message with the state: an AI Tool flow still has where to reply
	resultMsg := emitMessage(msg, msg.GetTopic(), payload)

	n.sendToOutputs(resultMsg, log)

	return nil
}

func (n *AssetStateNode) processGetStatesInGroupQuery(msg common.Message, log *logger.Logger) error {
	assetStates, err := n.GetAssetStatesInGroup(n.GroupUid, log)
	if err != nil {
		log.Errorf("AssetStateNode %s: failed to get asset states in group: %v", n.NodeUid, err)
		return fmt.Errorf("failed to get asset states in group: %w", err)
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
	// the same message with the state: an AI Tool flow still has where to reply
	resultMsg := emitMessage(msg, msg.GetTopic(), payload)

	n.sendToOutputs(resultMsg, log)

	return nil
}
