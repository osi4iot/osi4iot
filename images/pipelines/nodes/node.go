package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"pipelines/common"
	"pipelines/logger"

	"github.com/nats-io/nats.go"
)

func CreateNode(
	node common.NodeData,
	log *logger.Logger,
	fm common.Manager,
) (common.Node, error) {
	var newNode common.Node
	var err error
	switch node.Type {
	case "Listen":
		newNode, err = CreateListenNode(node, fm)
	case "Inject":
		newNode, err = CreateInjectNode(node, fm)
	case "Delay":
		newNode, err = CreateDelayNode(node, fm)
	case "Function":
		newNode, err = CreateFuncNode(node, fm)
	case "Telegram":
		newNode, err = CreateTelegramNode(node, fm)
	case "Email":
		newNode, err = CreateEmailNode(node, fm)
	case "Publish":
		newNode, err = CreatePublishNode(node, fm)
	default:
		log.Errorf("Unknown node type: %s", node.Type)
		newNode, err = nil, fmt.Errorf("unknown node type: %s", node.Type)
	}
	return newNode, err
}

type BaseNode struct {
	Id             int            `json:"id"`
	NodeUid        string         `json:"nodeUid"`
	OrgId          int            `json:"orgId"`
	OrgHash        string         `json:"orgHash"`
	GroupId        int            `json:"groupId"`
	AssetId        int            `json:"assetId"`
	DigitalTwinId  int            `json:"digitalTwinId"`
	DigitalTwinUID string         `json:"digitalTwinUid"`
	Name           string         `json:"name"`
	Type           string         `json:"type"`
	Xpos           float64        `json:"x"`
	Ypos           float64        `json:"y"`
	NumOutputs     int            `json:"numOutputs"`
	Settings       map[string]any `json:"settings"`
	Debug          string         `json:"debug"` // Indicates if debug mode is enabled

	LogSubject string
	Fm         common.Manager
	Ctx        context.Context
	Cancel     context.CancelFunc

	status      common.NodeStatus
	statusMutex sync.RWMutex
	wg          sync.WaitGroup
}

func (n *BaseNode) GetId() int {
	return n.Id
}

func (n *BaseNode) GetUid() string {
	return n.NodeUid
}

func (n *BaseNode) GetDigitalTwinId() int {
	return n.DigitalTwinId
}

func (n *BaseNode) GetDigitalTwinUID() string {
	return n.DigitalTwinUID
}

func (n *BaseNode) GetOrgId() int {
	return n.OrgId
}

func (n *BaseNode) GetOrgHash() string {
	return n.OrgHash
}

func (n *BaseNode) GetGroupId() int {
	return n.GroupId
}

func (n *BaseNode) GetAssetId() int {
	return n.AssetId
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

// IsStopped verifica si el nodo está detenido
func (n *BaseNode) IsStopped() bool {
	return n.GetStatus() == common.NodeStatusStopped
}

func (n *BaseNode) Stop(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusStopped {
		return
	}

	n.SetStatus(common.NodeStatusStopped)

	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait() //Wait for all goroutines to finish

	log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *BaseNode) SetStatus(status common.NodeStatus) {
	n.statusMutex.Lock()
	defer n.statusMutex.Unlock()
	n.status = status
}

func (n *BaseNode) handleError(err error) {
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

func (n *BaseNode) handleDebug(message common.Message, outputIndex int) {
	if n.LogSubject == "" {
		n.Fm.Log().Errorf("Node %s has no log subject set", n.NodeUid)
		return
	}

	nodeName := n.Name
	if outputIndex > 1 {
		nodeName = fmt.Sprintf("%s (%d)", n.Name, outputIndex)
	}

	topicType := strings.Split(message.Topic, ".")[0]
	topicUid := strings.Split(message.Topic, ".")[2][6:]

	logData := common.PipelineLog{
		Level:     "debug",
		Component: "node",
		Name:      nodeName,
		Uid:       n.NodeUid,
		Message:   "Debug message sent to output",
		TopicRef:  topicType,
		TopicUid:  topicUid,
		Payload:   message.Payload,
	}

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		n.Fm.NatsPublish(n.LogSubject, logJSON)
	} else {
		n.Fm.Log().Errorf("Failed to marshal log data for node %s: %v", n.NodeUid, marshallErr)
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
	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)

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
						n.handleError(err)
					}
				}
			}
		}(i, wire)
	}
}

func (n *BaseNode) sendToOutputs(msg common.Message, log *logger.Logger) {
	nodeOutputWires := n.Fm.GetNodeOutputWires(n.DigitalTwinId, n.Id)
	for outputIndex, wireArray := range nodeOutputWires {
		for idx, wire := range wireArray {
			select {
			case wire.Channel <- msg:
				if n.Debug == "on" && idx == 0 {
					n.handleDebug(msg, outputIndex)
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

	sub, err := n.Fm.NatsSubscribe(subject, func(msg *nats.Msg) {
		if err := messageHandler(msg, log); err != nil {
			n.handleError(err)
		}
	})

	if err != nil {
		log.Errorf("Failed to subscribe Node with UID %s: %v", n.NodeUid, err)
		n.handleError(fmt.Errorf("failed to subscribe: %w", err))
		return
	}

	<-n.Ctx.Done()
	log.Infof("Stopping Node with UID: %s", n.NodeUid)
	if err := sub.Unsubscribe(); err != nil {
		log.Errorf("Failed to unsubscribe Node with UID %s: %v", n.NodeUid, err)
	}
}
