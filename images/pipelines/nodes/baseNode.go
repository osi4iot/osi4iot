package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"sync"

	"pipelines/common"
	"pipelines/logger"
	nats_pkg "pipelines/nats"

	"github.com/nats-io/nats.go"
)

func CreateNode(
	node common.NodeData,
	log *logger.Logger,
	fm common.Manager,
	p common.Pipeline,
) (common.Node, error) {
	var newNode common.Node
	var err error

	switch node.Type {
	case "Listen":
		newNode, err = CreateListenNode(node, fm, p)
	case "Inject":
		newNode, err = CreateInjectNode(node, fm, p)
	case "Trigger":
		newNode, err = CreateTriggerNode(node, fm, p)
	case "Delay":
		newNode, err = CreateDelayNode(node, fm, p)
	case "Function":
		newNode, err = CreateFuncNode(node, fm, p)
	case "TelegramListen":
		orgId := p.GetOrgId()
		org := fm.GetOrg(orgId)
		if org == nil {
			log.Errorf("Organization with ID %d not found for TelegramListen node %s", orgId, node.NodeUid)
			return nil, fmt.Errorf("organization with ID %d not found", orgId)
		}
		newNode, err = CreateTelegramListenNode(node, fm, p, org)
	case "TelegramSend":
		newNode, err = CreateTelegramSendNode(node, fm, p)
	case "Email":
		newNode, err = CreateEmailNode(node, fm, p)
	case "AiAgent":
		newNode, err = CreateAiAgentNode(node, fm, p)
	case "MlModel":
		newNode, err = CreateMlmNode(node, fm, p)
	case "Publish":
		newNode, err = CreatePublishNode(node, fm, p)
	case "Batch":
		newNode, err = CreateBatchNode(node, fm, p)
	case "IoTDb":
		newNode, err = CreateIoTDbNode(node, fm, p)
	case "AssetState":
		newNode, err = CreateAssetStateNode(node, fm, p)
	case "Comment":
		newNode, err = CreateCommentNode(node, fm, p)
	default:
		log.Errorf("Unknown node type: %s", node.Type)
		newNode, err = nil, fmt.Errorf("unknown node type: %s", node.Type)
	}

	return newNode, err
}

type BaseNode struct {
	NodeUid    string         `json:"nodeUid"`
	Name       string         `json:"name"`
	Type       string         `json:"type"`
	Xpos       float64        `json:"x"`
	Ypos       float64        `json:"y"`
	NumOutputs int            `json:"numOutputs"`
	Settings   map[string]any `json:"settings"`
	Debug      string         `json:"debug"` // Indicates if debug mode is enabled

	Pipeline   common.Pipeline
	LogSubject string
	Fm         common.Manager
	Ctx        context.Context
	Cancel     context.CancelFunc

	status      common.NodeStatus
	statusMutex sync.RWMutex
	wg          sync.WaitGroup
}

func (n *BaseNode) GetUid() string {
	return n.NodeUid
}

func (n *BaseNode) GetDigitalTwinId() int {
	return n.Pipeline.GetDigitalTwinId()
}

func (n *BaseNode) GetDigitalTwinUid() string {
	return n.Pipeline.GetDigitalTwinUid()
}

func (n *BaseNode) GetOrgId() int {
	return n.Pipeline.GetOrgId()
}

func (n *BaseNode) GetOrgHash() string {
	return n.Pipeline.GetOrgHash()
}

func (n *BaseNode) GetGroupId() int {
	return n.Pipeline.GetGroupId()
}

func (n *BaseNode) GetAssetId() int {
	return n.Pipeline.GetAssetId()
}

func (n *BaseNode) GetNodeInputWires() []*common.Wire {
	return n.Pipeline.GetNodeInputWires(n.NodeUid)
}

func (n *BaseNode) GetNodeOutputWires() [][]*common.Wire {
	return n.Pipeline.GetNodeOutputWires(n.NodeUid)
}

func (n *BaseNode) GetNodeContext() context.Context {
	return n.Ctx
}

func (n *BaseNode) GetName() string {
	return n.Name
}

func (n *BaseNode) GetType() string {
	return n.Type
}

func (n *BaseNode) GetXpos() float64 {
	return n.Xpos
}

func (n *BaseNode) GetYpos() float64 {
	return n.Ypos
}

func (n *BaseNode) GetSettings() map[string]any {
	if n.Settings == nil {
		return make(map[string]any)
	}
	return n.Settings
}

func (n *BaseNode) GetStatus() common.NodeStatus {
	n.statusMutex.RLock()
	defer n.statusMutex.RUnlock()
	return n.status
}

func (n *BaseNode) IsRunning() bool {
	return n.GetStatus() == common.NodeStatusRunning
}

func (n *BaseNode) IsStopped() bool {
	return n.GetStatus() == common.NodeStatusStopped
}

func (n *BaseNode) Stop(log *logger.Logger) {
    if n.GetStatus() == common.NodeStatusStopped {
        log.Infof("Node %s is already stopped", n.NodeUid)
        return
    }

    if n.Cancel != nil {
        n.Cancel()
    }
    n.wg.Wait()
    n.ResetNodeContext()
    n.SetStatus(common.NodeStatusStopped)
    log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *BaseNode) SetStatus(status common.NodeStatus) {
	n.statusMutex.Lock()
	defer n.statusMutex.Unlock()
	n.status = status
}

func (n *BaseNode) ResetNodeContext() {
	ctx, cancel := context.WithCancel(context.Background())
	n.Cancel = cancel
	n.Ctx = ctx
}

func (n *BaseNode) HandleError(err error) {
	if n.LogSubject == "" {
		n.Fm.Log().Errorf("Node %s encountered an error but no log subject is set", n.NodeUid)
		return
	}

	description := fmt.Sprintf("Error in a node type %s ", n.Type)
	logData := common.PipelineLog{
		Level:       "error",
		Component:   "node",
		Name:        n.Name,
		Uid:         n.NodeUid,
		Description: description,
		Message:     err.Error(),
	}

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		n.Fm.NatsPublish(n.LogSubject, logJSON)
	} else {
		n.Fm.Log().Errorf("Failed to marshal log error data for node %s: %v", n.NodeUid, marshallErr)
	}
}

func (n *BaseNode) HandleDebug(message common.Message, outputIndex int) {
	if n.LogSubject == "" {
		n.Fm.Log().Errorf("Node %s has no log subject set", n.NodeUid)
		return
	}

	logData := common.PipelineLog{
		Level:       "debug",
		Component:   "node",
		Name:        n.Name,
		Uid:         n.NodeUid,
		Message:     "Debug message sent to output",
		OutputIndex: outputIndex,
		Payload:     message.Payload,
	}

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		n.Fm.NatsPublish(n.LogSubject, logJSON)
	} else {
		n.Fm.Log().Errorf("Failed to marshal log data for node %s: %v", n.NodeUid, marshallErr)
	}
}

func (n *BaseNode) HandleInfo(msg string) {
	if n.LogSubject == "" {
		n.Fm.Log().Errorf("Node %s has no log subject set", n.NodeUid)
		return
	}

	logData := common.PipelineLog{
		Level:       "info",
		Component:   "node",
		Name:        n.Name,
		Uid:         n.NodeUid,
		Description: "Info message from node",
		Message:     msg,
	}

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		n.Fm.NatsPublish(n.LogSubject, logJSON)
	} else {
		n.Fm.Log().Errorf("Failed to marshal info log data for node %s: %v", n.NodeUid, marshallErr)
	}
}

func (n *BaseNode) GetNumOutputs() int {
	return n.NumOutputs
}

func (n *BaseNode) GetDebug() string {
	if n.Debug == "" {
		return "off"
	}
	return n.Debug
}

func (n *BaseNode) handleInputWires(log *logger.Logger, processor func(common.Message, *logger.Logger) error) {
	nodeInputWires := n.GetNodeInputWires()

	if len(nodeInputWires) == 0 {
		return
	}

	for i, wire := range nodeInputWires {
		n.wg.Add(1)
		go func(channelIndex int, inputWire *common.Wire) {
			defer n.wg.Done()
			defer func() {
				log.Infof("Node channel %d goroutine terminated for UID: %s", channelIndex, n.NodeUid)
			}()

			for {
				select {
				case <-n.Ctx.Done():
					log.Infof("Stopping Node channel %d with UID: %s", channelIndex, n.NodeUid)
					return
				case msg, ok := <-inputWire.Channel:
					if !ok {
						log.Infof("Channel %d closed for Node with UID: %s", channelIndex, n.NodeUid)
						return
					}

					if n.GetStatus() != common.NodeStatusRunning {
						log.Infof("Node %s not running, discarding message on channel %d", n.NodeUid, channelIndex)
						continue
					}

					if err := processor(msg, log); err != nil {
						n.HandleError(err)
					}
				}
			}
		}(i, wire)
	}
}

func (n *BaseNode) sendToOutputs(msg common.Message, log *logger.Logger) {
	nodeOutputWires := n.GetNodeOutputWires()
	for outputIndex, wireArray := range nodeOutputWires {
		for idx, wire := range wireArray {
			outMsg := msg
			if idx > 0 || outputIndex > 0 {
				outMsg.Payload = make(map[string]any, len(msg.Payload))
				maps.Copy(outMsg.Payload, msg.Payload)
			}
			select {
			case wire.Channel <- outMsg:
				if n.Debug == "on" && idx == 0 {
					n.HandleDebug(outMsg, outputIndex)
				}
			case <-n.Ctx.Done():
				log.Infof("Context cancelled while sending message from node %s", n.NodeUid)
				return
			default:
				log.Warnf("Output channel full for node %s, dropping message", n.NodeUid)
			}
		}
	}
}

func (n *BaseNode) handleNatsSubscription(log *logger.Logger, subject string, messageHandler func(*nats.Msg, *logger.Logger) error) {
	defer n.wg.Done()
	defer n.SetStatus(common.NodeStatusStopped)

	queueName := fmt.Sprintf("node_%s", n.NodeUid)
	sub, err := n.Fm.NatsQueueSubscribe(subject, queueName, func(msg *nats.Msg) {
		if err := messageHandler(msg, log); err != nil {
			n.HandleError(err)
		}
	})

	if err != nil {
		log.Errorf("Failed to subscribe Node with UID %s: %v", n.NodeUid, err)
		n.HandleError(fmt.Errorf("failed to subscribe: %w", err))
		return
	}

	<-n.Ctx.Done()
	log.Infof("Stopping Node with UID: %s", n.NodeUid)
	if err := sub.Unsubscribe(); err != nil {
		log.Errorf("Failed to unsubscribe Node with UID %s: %v", n.NodeUid, err)
	}
}

func (n *BaseNode) IsLeader() bool {
	return n.Pipeline.GetLeaderElector().IsLeader()
}

func (n *BaseNode) GetDigitalTwinKvStore(digitalTwinId int) (*nats_pkg.KVStore, error) {
	kvStore := n.Fm.GetDigitalTwinKvStore(digitalTwinId)
	if kvStore == nil {
		return nil, fmt.Errorf("failed to get KV store for digital twin %d", digitalTwinId)
	}
	return kvStore, nil
}

func (n *BaseNode) GetGroupKvStore(groupId int) (*nats_pkg.KVStore, error) {
	kvStore := n.Fm.GetGroupKvStore(groupId)
	if kvStore == nil {
		return nil, fmt.Errorf("failed to get KV store for group %d", groupId)
	}
	return kvStore, nil
}

func (n *BaseNode) GetAssetStateKvStoreKey(assetUid string, groupUid string) string {
	return n.Fm.GetAssetStateKvStoreKey(n.GetOrgHash(), groupUid, assetUid)
}

func (n *BaseNode) GetAssetStateFromGroupKvStore(assetUid string, groupUid string) (map[string]any, error) {
	kvKey := n.GetAssetStateKvStoreKey(assetUid, groupUid)
	kvStore, err := n.GetGroupKvStore(n.Pipeline.GetGroupId())
	if err != nil {
		return nil, fmt.Errorf("failed to get KV store: %w", err)
	}

	assetState, err := kvStore.GetObjectValue(context.Background(), kvKey)
	if err != nil {
		return nil, fmt.Errorf("error getting value from store for key %s: %w", kvKey, err)
	}
	return assetState, nil
}

func (n *BaseNode) GetAssetStatesInGroupFromGroupKvStore(groupUid string, log *logger.Logger) (map[string]map[string]any, error) {
	assetStates := make(map[string]map[string]any)
	kvStore, err := n.GetGroupKvStore(n.Pipeline.GetGroupId())
	if err != nil {
		return nil, fmt.Errorf("failed to get KV store: %w", err)
	}

	keys, err := kvStore.ListKeys(context.Background(), fmt.Sprintf("org_%s-group_%s.asset_states.", n.GetOrgHash(), groupUid))
	if err != nil {
		return nil, fmt.Errorf("error listing keys from store for group %s: %w", groupUid, err)
	}

	for _, key := range keys {
		state, err := kvStore.GetObjectValue(context.Background(), key)
		if err != nil {
			log.Errorf("Error getting value from store for key %s: %v", key, err)
			continue
		}
		// Extract asset UID from the key
		var assetUid string
		_, err = fmt.Sscanf(key, fmt.Sprintf("org_%s-group_%s.asset_states.asset_%%s", n.GetOrgHash(), groupUid), &assetUid)
		if err != nil {
			log.Errorf("Error extracting asset UID from key %s: %v", key, err)
			continue
		}
		assetStates[assetUid] = state
	}
	return assetStates, nil
}
