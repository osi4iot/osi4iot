package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"pipelines/common"
	"pipelines/logger"
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
	Id            int            `json:"id"`
	NodeUid       string         `json:"nodeUid"`
	OrgId         int            `json:"orgId"`
	GroupId       int            `json:"groupId"`
	AssetId       int            `json:"assetId"`
	DigitalTwinId int            `json:"digitalTwinId"`
	Name          string         `json:"name"`
	Type          string         `json:"type"`
	Xpos          float64        `json:"x"`
	Ypos          float64        `json:"y"`
	Settings      map[string]any `json:"settings"`
	NumOutputs    int            `json:"numOutputs"`

	Fm            common.Manager
	Ctx           context.Context
	Cancel        context.CancelFunc
}

func (n *BaseNode) Stop(log *logger.Logger) {
	if n.Cancel != nil {
		n.Cancel()
	} else {
		log.Warnf("Node %s of type %s has no cancel function to stop", n.NodeUid, n.Type)
	}
}

func (n *BaseNode) GetId() int {
	return n.Id
}

func (n *BaseNode) GetUid() string {
	return n.NodeUid
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
