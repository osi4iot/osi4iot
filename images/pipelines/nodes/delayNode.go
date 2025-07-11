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
	durationFloat, ok := node.Settings["duration"].(float64)
	duration := int(durationFloat)
	if !ok || duration <= 0 {
		fm.Log().Errorf("DelayNode %s: 'duration' setting is required and must be a positive integer", node.NodeUid)
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	return &DelayNode{
		BaseNode: BaseNode{
			Id:            node.Id,
			NodeUid:       node.NodeUid,
			OrgId:         node.OrgId,
			GroupId:       node.GroupId,
			AssetId:       node.AssetId,
			DigitalTwinId: node.DigitalTwinId,
			Name:          node.Name,
			Xpos:          node.Xpos,
			Ypos:          node.Ypos,
			NumOutputs:    node.NumOutputs,
			Settings:      node.Settings,
			Type:          "Delay",
			Fm:            fm,
			Cancel:        cancel,
			Ctx:           ctx,
			status:        common.NodeStatusCreated,
		},
		Duration: duration,
	}
}

// func (n *DelayNode) Start(log *logger.Logger) {
// 	if n.GetStatus() == common.NodeStatusRunning {
// 		log.Infof("DelayNode %s is already running", n.NodeUid)
// 		return
// 	}

// 	n.SetStatus(common.NodeStatusRunning)

// 	log.Infof("Starting DelayNode with UID: %s", n.NodeUid)
// 	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)
// 	nodeOutputWires := n.Fm.GetNodeOutputWires(n.DigitalTwinId, n.Id)

// 	if len(nodeInputWires) == 0 {
// 		log.Errorf("No input wires found for DelayNode with UID: %s", n.NodeUid)
// 		n.SetStatus(common.NodeStatusStopped)
// 		return
// 	}

// 	for i, wire := range nodeInputWires {
// 		n.wg.Add(1)
// 		go func(channelIndex int, inputWire *common.Wire) {
// 			defer n.wg.Done()
// 			defer func() {
// 				log.Infof("DelayNode channel %d goroutine terminated for UID: %s", channelIndex, n.NodeUid)
// 			}()

// 			for {
// 				select {
// 				case <-n.Ctx.Done():
// 					log.Infof("Stopping DelayNode channel %d with UID: %s", channelIndex, n.NodeUid)
// 					return
// 				case msg, ok := <-inputWire.Channel:
// 					if !ok {
// 						log.Infof("Channel %d closed for DelayNode with UID: %s", channelIndex, n.NodeUid)
// 						return
// 					}

// 					if n.GetStatus() != common.NodeStatusRunning {
// 						log.Infof("DelayNode %s not running, discarding message on channel %d", n.NodeUid, channelIndex)
// 						continue
// 					}

// 					timer := time.NewTimer(time.Duration(n.Duration) * time.Millisecond)

// 					select {
// 					case <-n.Ctx.Done():
// 						timer.Stop()
// 						log.Infof("Stopping DelayNode with UID: %s during delay", n.NodeUid)
// 						return
// 					case <-timer.C:
// 						if n.GetStatus() != common.NodeStatusRunning {
// 							log.Infof("DelayNode %s stopped during delay, discarding message", n.NodeUid)
// 							continue
// 						}

// 						for _, wireArray := range nodeOutputWires {
// 							for _, wire := range wireArray {
// 								wire.Channel <- msg
// 							}
// 						}
// 					}
// 				}
// 			}
// 		}(i, wire)
// 	}
// }

func (n *DelayNode) Start(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("DelayNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting DelayNode with UID: %s", n.NodeUid)
	
	n.handleInputWires(log, n.processMessage)
}

func (n *DelayNode) processMessage(msg common.Message, log *logger.Logger) error {
	timer := time.NewTimer(time.Duration(n.Duration) * time.Millisecond)
	defer timer.Stop()

	select {
	case <-n.Ctx.Done():
		log.Infof("DelayNode %s context cancelled during delay", n.NodeUid)
		return nil
	case <-timer.C:
		if n.GetStatus() != common.NodeStatusRunning {
			log.Infof("DelayNode %s stopped during delay, discarding message", n.NodeUid)
			return nil
		}
		n.sendToOutputs(msg, log)
		return nil
	}
}