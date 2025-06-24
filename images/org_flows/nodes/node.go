package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"org_flows/common"
	"org_flows/config"
	"org_flows/logger"
)


func CreateNode(
	nodeConfig config.Node,
	flow common.Flow,
	log *logger.Logger,
) common.Node {
	switch nodeConfig.Type {
	case "Listen":
		return CreateListenNode(nodeConfig.Uid, flow, nodeConfig.Subject)
	case "Inject":
		return CreateInjectNode(nodeConfig.Uid, flow, nodeConfig.SubjectIn)
	case "Delay":
		return CreateDelayNode(nodeConfig.Uid, flow, nodeConfig.Duration)
	case "Function":
		funcNode, err := CreateFuncNode(nodeConfig.Uid, nodeConfig.Script, flow, log)
		if err != nil {
			log.Errorf("Failed to create Function node %s: %v", nodeConfig.Uid, err)
			return nil
		}
		return funcNode
	case "Watch":
		return CreateWatchNode(nodeConfig.Uid, flow, nodeConfig.Subject)
	case "Telegram":
		return CreateTelegramNode(nodeConfig.Uid, flow)
	case "Email":
		return CreateEmailNode(nodeConfig.Uid, flow)
	case "Publish":
		return CreatePublishNode(nodeConfig.Uid, flow, nodeConfig.Subject)
	default:
		log.Errorf("Unknown node type: %s", nodeConfig.Type)
		return nil
	}
}

type BaseNode struct {
	Uid    string
	Type   string
	Flow   common.Flow
	Cancel context.CancelFunc
	Ctx    context.Context
}

func (n *BaseNode) Stop(log *logger.Logger) {
	if n.Cancel != nil {
		n.Cancel()
	} else {
		log.Warnf("Node %s of type %s has no cancel function to stop", n.Uid, n.Type)
	}
}

func (n *BaseNode) GiveUid() string {
	return n.Uid
}

func (n *BaseNode) handleError(err error) {
	errorData := map[string]interface{}{
		"node":  n.Uid,
		"error": err.Error(),
	}

	if errorJSON, marshallErr := json.Marshal(errorData); marshallErr == nil {
		errorSubject := fmt.Sprintf("%s.error", n.Flow.FlowUID)
		n.Flow.Nats.Publish(errorSubject, errorJSON)
	} else {
		log.Printf("Failed to marshal error data for node %s: %v", n.Uid, marshallErr)
	}
}

func (n *BaseNode) HandleInfo(info string) {
	infoData := map[string]interface{}{
		"node": n.Uid,
		"info": info,
	}

	if infoJSON, marshallErr := json.Marshal(infoData); marshallErr == nil {
		infoSubject := fmt.Sprintf("%s.info", n.Flow.FlowUID)
		n.Flow.Nats.Publish(infoSubject, infoJSON)
	} else {
		log.Printf("Failed to marshal info data for node %s: %v", n.Uid, marshallErr)
	}
}
