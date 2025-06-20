package flows_manager

import (
	"encoding/json"
	"fmt"
	"org_flows/logger"

	"github.com/nats-io/nats.go"
)

type ListenNode struct {
	BaseNode
	Subject string
}

func CreateListenNode(nodeUid string, flow *Flow, subject string) *ListenNode {
	return &ListenNode{
		BaseNode: BaseNode{
			Uid:  nodeUid,
			Type: "ListenNode",
			Flow: flow,
		},
		Subject: subject,
	}
}

func (n *ListenNode) Start(log *logger.Logger) {
	log.Infof("Starting ListenNode with UID: %s", n.Uid)
	n.Flow.FM.Nats.Subscribe(n.Subject, func(msg *nats.Msg) {
		for _, childNode := range n.Flow.Children[n.Uid] {
			var message Message
			if err := json.Unmarshal(msg.Data, &message); err != nil {
				log.Infof("Failed to unmarshal message for node %s: %v", n.Uid, err)
				n.handleError(fmt.Errorf("failed to unmarshal message: %w", err))
				continue
			}
			n.Flow.Channels[childNode] <- message
		}
	})
}