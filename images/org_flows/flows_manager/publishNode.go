package flows_manager

import (
	"encoding/json"
	"org_flows/logger"
)

type PublishNode struct {
	BaseNode
	Subject string
}

func CreatePublishNode(nodeUid string, flow *Flow, subject string) *PublishNode {
	return &PublishNode{
		BaseNode: BaseNode{
			Uid:  nodeUid,
			Type: "PublishNode",
			Flow: flow,
		},
		Subject: subject,
	}
}

func (n *PublishNode) Start(log *logger.Logger) {
	log.Infof("Starting PublishNode with UID: %s", n.Uid)
	go func() {
		for msg := range n.Flow.Channels[n.Uid] {
			jsonData, err := json.Marshal(msg)
			if err != nil {
				log.Errorf("Failed to marshal message for node %s: %v", n.Uid, err)
				continue
			}
			if err := n.Flow.FM.Nats.Publish(n.Subject, jsonData); err != nil {
				log.Errorf("Failed to publish message for node %s: %v", n.Uid, err)
			}
		}
	}()
}
