package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"org_flows/common"
	"org_flows/logger"

	"github.com/nats-io/nats.go"
)

type InjectNode struct {
	BaseNode
	SubjectIn string
}

func CreateInjectNode(nodeUid string, flow common.Flow, subjectIn string) *InjectNode {
	ctx, cancel := context.WithCancel(context.Background())
	return &InjectNode{
		BaseNode: BaseNode{
			Uid:    nodeUid,
			Type:   "InjectNode",
			Flow:   flow,
			Cancel: cancel,
			Ctx:    ctx,
		},
		SubjectIn: subjectIn,
	}
}

func (n *InjectNode) Start(log *logger.Logger) {
	go func () {
		log.Infof("Starting InjectNode with UID: %s", n.Uid)
		sub, err := n.Flow.Nats.Subscribe(n.SubjectIn, func(msg *nats.Msg) {
			var message common.Message
			if err := json.Unmarshal(msg.Data, &message); err != nil {
				log.Infof("Failed to unmarshal message for node %s: %v", n.Uid, err)
				n.handleError(fmt.Errorf("failed to unmarshal message: %w", err))
			}
	
			subject := message.Subject
			if subject != "" && subject != n.SubjectIn {
				if err := n.Flow.Nats.Publish(subject, msg.Data); err != nil {
					n.handleError(fmt.Errorf("failed to publish message: %w", err))
				}
			}
		})
	
		if err != nil {
			log.Errorf("Failed to subscribe InjectNode with UID %s: %v", n.Uid, err)
			n.handleError(fmt.Errorf("failed to subscribe: %w", err))
			return
		}

		<-n.Ctx.Done()
		log.Infof("Stopping InjectNode with UID: %s", n.Uid)
		if err := sub.Unsubscribe(); err != nil {
			log.Errorf("Failed to unsubscribe InjectNode with UID %s: %v", n.Uid, err)
		}
	}()
}
