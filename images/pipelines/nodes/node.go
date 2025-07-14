package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"pipelines/common"
	"pipelines/logger"

	"github.com/nats-io/nats.go"
)

func CreateNode(
	node common.NodeData,
	log *logger.Logger,
	fm common.Manager,
) common.Node {
	switch node.Type {
	case "Listen":
		return CreateListenNode(node, fm)
	case "Inject":
		return CreateInjectNode(node, fm)
	case "Delay":
		return CreateDelayNode(node, fm)
	case "Function":
		funcNode, err := CreateFuncNode(node, fm)
		if err != nil {
			log.Errorf("Failed to create Function node %s: %v", node.NodeUid, err)
			return nil
		}
		return funcNode
	case "Telegram":
		return CreateTelegramNode(node, fm)
	case "Email":
		return CreateEmailNode(node, fm)
	case "Publish":
		return CreatePublishNode(node, fm)
	default:
		log.Errorf("Unknown node type: %s", node.Type)
		return nil
	}
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

	Fm     common.Manager
	Ctx    context.Context
	Cancel context.CancelFunc

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
	errorData := map[string]interface{}{
		"node":  n.NodeUid,
		"error": err.Error(),
	}

	if errorJSON, marshallErr := json.Marshal(errorData); marshallErr == nil {
		errorSubject := fmt.Sprintf("dt_%d.error", n.DigitalTwinId)
		n.Fm.NatsPublish(errorSubject, errorJSON)
	} else {
		log.Printf("Failed to marshal error data for node %s: %v", n.NodeUid, marshallErr)
	}
}

func (n *BaseNode) HandleInfo(info string) {
	infoData := map[string]interface{}{
		"node": n.NodeUid,
		"info": info,
	}

	org := n.Fm.GetOrg(n.OrgId)
	digitalTwin := n.Fm.GetDigitalTwin(n.DigitalTwinId)

	if infoJSON, marshallErr := json.Marshal(infoData); marshallErr == nil {
		infoSubject := fmt.Sprintf("org_%s.dt_%s.info", org.OrgHash, digitalTwin.DigitalTwinUID)
		n.Fm.NatsPublish(infoSubject, infoJSON)
	} else {
		log.Printf("Failed to marshal info data for node %s: %v", n.NodeUid, marshallErr)
	}
}

func (n *BaseNode) GetNumOutputs() int {
	return n.NumOutputs
}

func (n *BaseNode) handleInputWires(log *logger.Logger, processor func(common.Message, *logger.Logger) error) {
	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)

	if len(nodeInputWires) == 0 {
		log.Errorf("No input wires found for Node with UID: %s", n.NodeUid)
		n.SetStatus(common.NodeStatusStopped)
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
	for _, wireArray := range nodeOutputWires {
		for _, wire := range wireArray {
			select {
			case wire.Channel <- msg:
				// Message sent successfully
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
