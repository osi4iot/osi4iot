package nodes

import (
	"context"
	"org_flows/common"
	"org_flows/logger"
	"org_flows/utils"
)

type TelegramNode struct {
	BaseNode
	BotToken string
	ChatID   int64
}

func CreateTelegramNode(nodeUid string, flow common.Flow) *TelegramNode {
	ctx, cancel := context.WithCancel(context.Background())
	return &TelegramNode{
		BaseNode: BaseNode{
			Uid:    nodeUid,
			Type:   "TelegramNode",
			Flow:   flow,
			Cancel: cancel,
			Ctx:    ctx,
		},
		ChatID:   int64(flow.TelegramChatID),
		BotToken: flow.TelegramBotToken,
	}
}

func (n *TelegramNode) Start(log *logger.Logger) {
	log.Infof("Starting TelegramNode with UID: %s", n.Uid)
	go func() {
		for {
			select {
			case <-n.Ctx.Done():
				log.Infof("Stopping TelegramNode with UID: %s", n.Uid)
				return
			case msg, ok := <-n.Flow.Channels[n.Uid]:
				if !ok {
					log.Infof("Channel closed for TelegramNode with UID: %s", n.Uid)
					return
				}
				payload := msg.Payload.(map[string]interface{})
				if message, ok := payload["message"].(string); ok {
					utils.SendTelegramMessage(n.BotToken, n.ChatID, message, log)
				}
			}
		}
	}()
}
