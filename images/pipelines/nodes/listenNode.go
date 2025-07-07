package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/logger"

	"github.com/nats-io/nats.go"
)

type ListenNode struct {
	BaseNode
	Subject string
}

func CreateListenNode(node common.NodeData, fm common.Manager) *ListenNode {
	subject, ok := node.Settings["subject"].(string)
	if !ok || subject == "" {
		fm.Log().Errorf("ListenNode %s: 'subject' setting is required", node.NodeUid)
		return nil
	}
	
	ctx, cancel := context.WithCancel(context.Background())
	return &ListenNode{
		BaseNode: BaseNode{
			Id:      node.Id,
			NodeUid: node.NodeUid,
			OrgId:   node.OrgId,
			GroupId: node.GroupId,
			AssetId: node.AssetId,
			DigitalTwinId: node.DigitalTwinId,
			Name:    node.Name,
			Xpos:    node.Xpos,
			Ypos:    node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings: node.Settings,
			Type:       "ListenNode",
			Fm:        fm,
			Cancel:    cancel,
			Ctx:       ctx,
		},
		Subject: subject,
	}
}

func (n *ListenNode) Start(log *logger.Logger) {
	nodeOutputWires := n.Fm.GetNodeOutputWires(n.DigitalTwinId, n.Id)
	go func() {
		log.Infof("Starting ListenNode with UID: %s", n.NodeUid)
		sub, err := n.Fm.NatsSubscribe(n.Subject, func(msg *nats.Msg) {
			for _, wireArray := range nodeOutputWires {
				var message common.Message
				if err := json.Unmarshal(msg.Data, &message); err != nil {
					log.Infof("Failed to unmarshal message for node %s: %v", n.NodeUid, err)
					n.handleError(fmt.Errorf("failed to unmarshal message: %w", err))
					continue
				}
				for _, wire := range wireArray {
					wire.Channel <- message
				}
			}
		})
		if err != nil {
			log.Errorf("Failed to subscribe ListenNode with UID %s: %v", n.NodeUid, err)
			n.handleError(fmt.Errorf("failed to subscribe: %w", err))
			return
		}

		<-n.Ctx.Done()
		log.Infof("Stopping ListenNode with UID: %s", n.NodeUid)
		if err := sub.Drain(); err != nil {
			log.Errorf("Failed to unsubscribe ListenNode with UID %s: %v", n.NodeUid, err)
		}
	}()
}
