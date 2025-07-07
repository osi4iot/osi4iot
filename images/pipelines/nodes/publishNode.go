package nodes

import (
	"context"
	"encoding/json"
	"pipelines/common"
	"pipelines/logger"
)

type PublishNode struct {
	BaseNode
	Subject string
}

func CreatePublishNode(node common.NodeData, fm common.Manager) *PublishNode {
	subject, ok := node.Settings["subject"].(string)
	if !ok || subject == "" {
		fm.Log().Errorf("PublishNode %s: 'subject' setting is required", node.NodeUid)
		return nil
	}
	
	ctx, cancel := context.WithCancel(context.Background())
	return &PublishNode{
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
			Type:    "PublishNode",
			Fm:      fm,
			Cancel:  cancel,
			Ctx:     ctx,
		},
		Subject: subject,
	}
}

func (n *PublishNode) Start(log *logger.Logger) {
	log.Infof("Starting PublishNode with UID: %s", n.NodeUid)
	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)
	
	if len(nodeInputWires) == 0 {
		log.Errorf("No input wires found for PublishNode with UID: %s", n.NodeUid)
		return
	}
	
	for i, wire := range nodeInputWires {
		go func(channelIndex int, inputWire *common.Wire) {
			for {
				select {
				case <-n.Ctx.Done():
					log.Infof("Stopping PublishNode channel %d with UID: %s", channelIndex, n.NodeUid)
					return
				case msg, ok := <-inputWire.Channel:
					if !ok {
						log.Infof("Channel %d closed for PublishNode with UID: %s", channelIndex, n.NodeUid)
						return
					}
					
					jsonData, err := json.Marshal(msg)
					if err != nil {
						log.Errorf("Failed to marshal message from channel %d for node %s: %v", channelIndex, n.NodeUid, err)
						continue
					}
					
					if err := n.Fm.NatsPublish(n.Subject, jsonData); err != nil {
						log.Errorf("Failed to publish message from channel %d for node %s: %v", channelIndex, n.NodeUid, err)
					}
				}
			}
		}(i, wire)
	}
}