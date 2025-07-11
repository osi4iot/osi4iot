package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
)

type TelegramNode struct {
	BaseNode
	BotToken string
	ChatID   int64
}

func CreateTelegramNode(node common.NodeData, fm common.Manager) *TelegramNode {
	ctx, cancel := context.WithCancel(context.Background())
	return &TelegramNode{
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
			Type:          "Telegram",
			Fm:            fm,
			Cancel:        cancel,
			Ctx:           ctx,
			status:        common.NodeStatusCreated,
		},
		ChatID:   fm.GetGroupTelegramChatID(),
		BotToken: fm.GetPlatformTelegramBotToken(),
	}
}

// func (n *TelegramNode) Start(log *logger.Logger) {
// 	if n.GetStatus() == common.NodeStatusRunning {
// 		log.Infof("DelayNode %s is already running", n.NodeUid)
// 		return
// 	}

// 	n.SetStatus(common.NodeStatusRunning)

// 	log.Infof("Starting TelegramNode with UID: %s", n.NodeUid)
// 	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)

// 	if len(nodeInputWires) == 0 {
// 		log.Errorf("No input wires found for TelegramNode with UID: %s", n.NodeUid)
// 		n.SetStatus(common.NodeStatusStopped)
// 		return
// 	}

// 	for i, wire := range nodeInputWires {
// 		n.wg.Add(1)
// 		go func(channelIndex int, inputWire *common.Wire) {
// 			defer n.wg.Done()
// 			defer func() {
// 				log.Infof("TelegramNode channel %d goroutine terminated for UID: %s", channelIndex, n.NodeUid)
// 			}()
			
// 			for {
// 				select {
// 				case <-n.Ctx.Done():
// 					log.Infof("Stopping TelegramNode channel %d with UID: %s", channelIndex, n.NodeUid)
// 					return
// 				case msg, ok := <-inputWire.Channel:
// 					if !ok {
// 						log.Infof("Channel closed for TelegramNode with UID: %s", n.NodeUid)
// 						return
// 					}

// 					payload := msg.Payload.(map[string]interface{})
// 					if message, ok := payload["message"].(string); ok {
// 						utils.SendTelegramMessage(n.BotToken, n.ChatID, message, log)
// 					}
// 				}
// 			}
// 		}(i, wire)
// 	}
// }

func (n *TelegramNode) Start(log *logger.Logger) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TelegramNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TelegramNode with UID: %s", n.NodeUid)
	
	n.handleInputWires(log, n.processMessage)
}

func (n *TelegramNode) processMessage(msg common.Message, log *logger.Logger) error {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payload format in TelegramNode with UID: %s", n.NodeUid)
	}

	message, ok := payload["message"].(string)
	if !ok {
		return fmt.Errorf("missing message in TelegramNode with UID: %s", n.NodeUid)
	}

	return utils.SendTelegramMessage(n.BotToken, n.ChatID, message, log)
}
