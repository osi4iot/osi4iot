package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/telegram"
	"pipelines/utils"
	"strconv"
)

type TelegramSendNode struct {
	BaseNode
	BotToken        string
	ChatID          int64
	IsCustomMessage bool
	MessageToSend   string
}

func CreateTelegramSendNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*TelegramSendNode, error) {
	chatIDStr, ok := node.Settings["chatId"].(string)
	if !ok || chatIDStr == "" {
		return nil, fmt.Errorf("chatId setting is required")
	}
	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid chatId: %v", err)
	}

	orgId := p.GetOrgId()
	org := fm.GetOrg(orgId)
	if org == nil {
		return nil, fmt.Errorf("organization with ID %d not found for TelegramNode", orgId)
	}
	botToken := org.TelegramBotToken
	isCustomMessage := false
	messageToSend := ""
	messageOptions, ok := node.Settings["messageOptions"].(string)
	if !ok || messageOptions == "" {
		return nil, fmt.Errorf("messageOptions setting is required")
	}

	switch messageOptions {
	case "Message received options":
		botToken = org.TelegramBotToken
	case "Custom telegram options":
		isCustomMessage = true
		if messageToSend, ok = node.Settings["message"].(string); !ok || messageToSend == "" {
			return nil, fmt.Errorf("message setting is required for custom options")
		}
	default:
		return nil, fmt.Errorf("invalid messageOptions setting: %s", messageOptions)
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &TelegramSendNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "TelegramSend",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     cancel,
			Ctx:        ctx,
			status:     common.NodeStatusCreated,
		},
		BotToken:        botToken,
		ChatID:          chatID,
		IsCustomMessage: isCustomMessage,
		MessageToSend:   messageToSend,
	}, nil
}

func (n *TelegramSendNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TelegramSendNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TelegramSendNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processSendMessage)

}

func (n *TelegramSendNode) processSendMessage(msg common.Message, log *logger.Logger) error {
	message := n.MessageToSend
	opts := []telegram.MessageOption{}
	if !n.IsCustomMessage {
		var ok bool
		message, ok = msg.Payload["message"].(string)
		if !ok {
			return fmt.Errorf("missing message in TelegramNode with UID: %s", n.NodeUid)
		}

		if parseMode, ok := msg.Payload["parseMode"].(string); ok && parseMode != "" {
			if parseMode != telegram.ParseModeHTML && parseMode != telegram.ParseModeMarkdownV2 {
				log.Warnf("Invalid parse mode '%s' in message payload, defaulting to no parse mode", parseMode)
			} else {
				opts = append(opts, telegram.WithParseMode(parseMode))
			}
		}

	}

	return telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, opts...)
}


func (n *TelegramSendNode) Stop(log *logger.Logger) {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("TelegramSendNode %s is not running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)
	log.Infof("Stopping TelegramSendNode with UID: %s", n.NodeUid)
}
