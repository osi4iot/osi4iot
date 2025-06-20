package flows_manager

import (
	"encoding/json"
	"fmt"
	"org_flows/logger"

	"github.com/nats-io/nats.go"
)

type InjectNode struct {
	BaseNode
	SubjectIn string
}

func CreateInjectNode(nodeUid string, flow *Flow, subjectIn string) *InjectNode {
	return &InjectNode{
		BaseNode: BaseNode{
			Uid:  nodeUid,
			Type: "InjectNode",
			Flow: flow,
		},
		SubjectIn: subjectIn,
	}
}

func (n *InjectNode) Start(log *logger.Logger) {
	log.Infof("Starting InjectNode with UID: %s", n.Uid)
	n.Flow.FM.Nats.Subscribe(n.SubjectIn, func(msg *nats.Msg) {
		var message Message
		if err := json.Unmarshal(msg.Data, &message); err != nil {
			log.Infof("Failed to unmarshal message for node %s: %v", n.Uid, err)
			n.handleError(fmt.Errorf("failed to unmarshal message: %w", err))
		}

		subject := message.Subject
		if subject != "" && subject != n.SubjectIn {
			if err := n.Flow.FM.Nats.Publish(subject, msg.Data); err != nil {
				n.handleError(fmt.Errorf("failed to publish message: %w", err))
			}
		}
	})
}
