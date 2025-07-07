package nodes

import (
	"context"
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
			Type:    "TelegramNode",
			Fm:      fm,
			Cancel:  cancel,
			Ctx:     ctx,
		},
		ChatID:   fm.GetGroupTelegramChatID(),
		BotToken: fm.GetPlatformTelegramBotToken(),
	}
}

func (n *TelegramNode) Start(log *logger.Logger) {
	log.Infof("Starting TelegramNode with UID: %s", n.NodeUid)
	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)

	if len(nodeInputWires) == 0 {
		log.Errorf("No input wires found for TelegramNode with UID: %s", n.NodeUid)
		return
	}

	for i, wire := range nodeInputWires {
		go func(channelIndex int, inputWire *common.Wire) {
			for {
				select {
				case <-n.Ctx.Done():
					log.Infof("Stopping TelegramNode channel %d with UID: %s", channelIndex, n.NodeUid)
					return
				case msg, ok := <-inputWire.Channel:
					if !ok {
						log.Infof("Channel closed for TelegramNode with UID: %s", n.NodeUid)
						return
					}

					payload := msg.Payload.(map[string]interface{})
					if message, ok := payload["message"].(string); ok {
						utils.SendTelegramMessage(n.BotToken, n.ChatID, message, log)
					}
				}
			}
		}(i, wire)
	}
}
