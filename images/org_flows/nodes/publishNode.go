package nodes

import (
	"context"
	"encoding/json"
	"org_flows/common"
	"org_flows/logger"
)

type PublishNode struct {
	BaseNode
	Subject string
}

func CreatePublishNode(nodeUid string, flow common.Flow, subject string) *PublishNode {
	ctx, cancel := context.WithCancel(context.Background())
	return &PublishNode{
		BaseNode: BaseNode{
			Uid:    nodeUid,
			Type:   "PublishNode",
			Flow:   flow,
			Cancel: cancel,
			Ctx:    ctx,
		},
		Subject: subject,
	}
}

func (n *PublishNode) Start(log *logger.Logger) {
	log.Infof("Starting PublishNode with UID: %s", n.Uid)
	go func() {
		for {
			select {
			case <-n.Ctx.Done():
				log.Infof("Stopping PublishNode with UID: %s", n.Uid)
				return
			case msg, ok := <-n.Flow.Channels[n.Uid]:
				if !ok {
					log.Infof("Channel closed for PublishNode with UID: %s", n.Uid)
					return
				}
				
				jsonData, err := json.Marshal(msg)
				if err != nil {
					log.Errorf("Failed to marshal message for node %s: %v", n.Uid, err)
					continue
				}
				
				if err := n.Flow.Nats.Publish(n.Subject, jsonData); err != nil {
					log.Errorf("Failed to publish message for node %s: %v", n.Uid, err)
				}
			}
		}
	}()
}
