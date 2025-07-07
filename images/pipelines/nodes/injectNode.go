package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/logger"

	"github.com/nats-io/nats.go"
)

type InjectNode struct {
	BaseNode
	SubjectIn string
}

func CreateInjectNode(node common.NodeData, fm common.Manager) *InjectNode {
	
	subjectIn, ok := node.Settings["subjectIn"].(string)
	if !ok || subjectIn == "" {
		fm.Log().Errorf("InjectNode %s: 'subjectIn' setting is required", node.NodeUid)
		return nil
	}
	
	ctx, cancel := context.WithCancel(context.Background())
	return &InjectNode{
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
			Type:       "InjectNode",
			Fm:        fm,
			Cancel:    cancel,
			Ctx:       ctx,
		},
		SubjectIn: subjectIn,
	}
}

func (n *InjectNode) Start(log *logger.Logger) {
	go func () {
		log.Infof("Starting InjectNode with UID: %s", n.NodeUid)
		sub, err := n.Fm.NatsSubscribe(n.SubjectIn, func(msg *nats.Msg) {
			var message common.Message
			if err := json.Unmarshal(msg.Data, &message); err != nil {
				log.Infof("Failed to unmarshal message for node %s: %v", n.NodeUid, err)
				n.handleError(fmt.Errorf("failed to unmarshal message: %w", err))
			}
	
			subject := message.Subject
			if subject != "" && subject != n.SubjectIn {
				if err := n.Fm.NatsPublish(subject, msg.Data); err != nil {
					n.handleError(fmt.Errorf("failed to publish message: %w", err))
				}
			}
		})
	
		if err != nil {
			log.Errorf("Failed to subscribe InjectNode with UID %s: %v", n.NodeUid, err)
			n.handleError(fmt.Errorf("failed to subscribe: %w", err))
			return
		}

		<-n.Ctx.Done()
		log.Infof("Stopping InjectNode with UID: %s", n.NodeUid)
		if err := sub.Unsubscribe(); err != nil {
			log.Errorf("Failed to unsubscribe InjectNode with UID %s: %v", n.NodeUid, err)
		}
	}()
}
