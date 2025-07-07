package nodes

import (
	"context"
	"pipelines/common"
	"pipelines/logger"
	"time"
)

type DelayNode struct {
	BaseNode
	Duration int // Delay in milliseconds
}

func CreateDelayNode(node common.NodeData, fm common.Manager) *DelayNode {
	duration, ok := node.Settings["duration"].(int)
	if !ok || duration <= 0 {
		fm.Log().Errorf("DelayNode %s: 'duration' setting is required and must be positive", node.NodeUid)
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	return &DelayNode{
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
			Type:    "DelayNode",
			Fm:      fm,
			Cancel:  cancel,
			Ctx:     ctx,
		},
		Duration: duration,
	}
}


func (n *DelayNode) Start(log *logger.Logger) {
	log.Infof("Starting DelayNode with UID: %s", n.NodeUid)
	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)
	nodeOutputWires := n.Fm.GetNodeOutputWires(n.DigitalTwinId, n.Id)

	if len(nodeInputWires) == 0 {
		log.Errorf("No input wires found for DelayNode with UID: %s", n.NodeUid)
		return
	}

	for i, wire := range nodeInputWires {
		go func(channelIndex int, inputWire *common.Wire) {
			for {
				select {
				case <-n.Ctx.Done():
					log.Infof("Stopping DelayNode channel %d with UID: %s", channelIndex, n.NodeUid)
					return
				case msg, ok := <-inputWire.Channel:
					if !ok {
						log.Infof("Channel %d closed for DelayNode with UID: %s", channelIndex, n.NodeUid)
						return
					}

					select {
					case <-n.Ctx.Done():
						log.Infof("Stopping DelayNode with UID: %s during delay", n.NodeUid)
						return
					case <-time.After(time.Duration(n.Duration) * time.Millisecond):
					}

					for _, wireArray := range nodeOutputWires {
						for _, wire := range wireArray {
							wire.Channel <- msg
						}
					}
				}
			}
		}(i, wire)
	}
}
