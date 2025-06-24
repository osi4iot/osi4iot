package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"org_flows/common"
	"org_flows/logger"

	"github.com/nats-io/nats.go"
)

type ListenNode struct {
	BaseNode
	Subject string
}

func CreateListenNode(nodeUid string, flow common.Flow, subject string) *ListenNode {
	ctx, cancel := context.WithCancel(context.Background())
	return &ListenNode{
		BaseNode: BaseNode{
			Uid:    nodeUid,
			Type:   "ListenNode",
			Flow:   flow,
			Cancel: cancel,
			Ctx:    ctx,
		},
		Subject: subject,
	}
}

func (n *ListenNode) Start(log *logger.Logger) {
	go func() {
		log.Infof("Starting ListenNode with UID: %s", n.Uid)
		sub, err := n.Flow.Nats.Subscribe(n.Subject, func(msg *nats.Msg) {
			for _, childNode := range n.Flow.Children[n.Uid] {
				var message common.Message
				if err := json.Unmarshal(msg.Data, &message); err != nil {
					log.Infof("Failed to unmarshal message for node %s: %v", n.Uid, err)
					n.handleError(fmt.Errorf("failed to unmarshal message: %w", err))
					continue
				}
				n.Flow.Channels[childNode] <- message
			}
		})
		if err != nil {
			log.Errorf("Failed to subscribe ListenNode with UID %s: %v", n.Uid, err)
			n.handleError(fmt.Errorf("failed to subscribe: %w", err))
			return
		}

		<-n.Ctx.Done()
		log.Infof("Stopping ListenNode with UID: %s", n.Uid)
		if err := sub.Drain(); err != nil {
			log.Errorf("Failed to unsubscribe ListenNode with UID %s: %v", n.Uid, err)
		}
	}()
}
