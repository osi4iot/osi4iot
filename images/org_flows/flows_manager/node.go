package flows_manager

import (
	"encoding/json"
	"fmt"
	"log"
	"org_flows/config"
	"org_flows/logger"
	"org_flows/utils"
)

type Message struct {
	Timestamp utils.Timestamp `json:"timestamp"`
	Subject   string          `json:"subject"`
	Payload   map[string]any  `json:"payload"`
	State     map[string]any  `json:"state"`
}

type Node interface {
	Start(log *logger.Logger)
	GiveUid() string
}

func CreateNode(nodeConfig config.Node, flow *Flow, log *logger.Logger) Node {
	switch nodeConfig.Type {
	case "Listen":
		return CreateListenNode(nodeConfig.Uid, flow, nodeConfig.Subject)
	case "Inject":
		return CreateInjectNode(nodeConfig.Uid, flow, nodeConfig.SubjectIn)
	case "Function":
		funcNode, err := CreateFuncNode(nodeConfig.Uid, nodeConfig.Script, flow, log)
		if err != nil {
			log.Errorf("Failed to create Function node %s: %v", nodeConfig.Uid, err)
			return nil
		}
		return funcNode
	case "Publish":
		return CreatePublishNode(nodeConfig.Uid, flow, nodeConfig.Subject)
	default:
		log.Errorf("Unknown node type: %s", nodeConfig.Type)
		return nil
	}
}

type BaseNode struct {
	Uid  string
	Type string
	Flow *Flow
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
		n.Flow.FM.Nats.Publish(errorSubject, errorJSON)
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
		n.Flow.FM.Nats.Publish(infoSubject, infoJSON)
	} else {
		log.Printf("Failed to marshal info data for node %s: %v", n.Uid, marshallErr)
	}
}