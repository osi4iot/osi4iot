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

type TelegramListenNode struct {
	BaseNode
	BotToken                 string
	ChatID                   int64
	TelegramListener         *telegram.OrgListener
	ListenMsgChannel         chan *telegram.TelegramMessage
	UnSubscribe              context.CancelFunc
	ClearChatMessagesHistory func(userName string)
}

func CreateTelegramListenNode(node common.NodeData, fm common.Manager, p common.Pipeline, org *common.Org) (*TelegramListenNode, error) {
	telegramEnabled := org.TelegramEnabled
	if !telegramEnabled {
		return nil, fmt.Errorf("Telegram integration is not enabled for organization %d", org.Id)
	}

	telegramListener := org.TelegramListener
	botToken := org.TelegramBotToken
	if telegramListener == nil || botToken == "" {
		return nil, fmt.Errorf("Telegram listener or bot token not configured for organization %d", org.Id)
	}

	chatIDStr, ok := node.Settings["chatId"].(string)
	if !ok || chatIDStr == "" {
		return nil, fmt.Errorf("chatId setting is required")
	}
	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid chatId: %v", err)
	}
	listenMsgChannel := make(chan *telegram.TelegramMessage, 100)
	unsubcribe := telegramListener.Subscribe(chatID, listenMsgChannel)

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &TelegramListenNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "TelegramListen",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     cancel,
			Ctx:        ctx,
			status:     common.NodeStatusCreated,
		},
		BotToken:                 botToken,
		ChatID:                   chatID,
		TelegramListener:         telegramListener,
		ListenMsgChannel:         listenMsgChannel,
		UnSubscribe:              unsubcribe,
		ClearChatMessagesHistory: p.ClearChatMessagesHistory,
	}, nil
}

func (n *TelegramListenNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TelegramListenNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TelegramListenNode with UID: %s", n.NodeUid)

	go n.processListenMessage(log)
}

func (n *TelegramListenNode) processListenMessage(log *logger.Logger) {
	for {
		select {
        case <-n.Ctx.Done():
            return
		case msg, ok := <-n.ListenMsgChannel:
			if !ok {
				return // canal cerrado por OrgListener.Stop()
			}
			if msg.Text == "/clear" {
				if n.ClearChatMessagesHistory != nil {
					n.ClearChatMessagesHistory(n.chatUserName(msg.ChatID))
					message := "<i>Chat history cleared successfully</i>"
					telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
				}
				continue
			}
			outputMsg := common.Message{
				Payload: map[string]any{
					"message_id": msg.MessageID,
					"chat_id":    msg.ChatID,
					"text":       msg.Text,
					"entities":   msg.Entities,
					"message":    msg.Text,
					"userName":   n.chatUserName(msg.ChatID),
				},
			}

			n.sendToOutputs(outputMsg, log)
		}
	}
}

func (n *TelegramListenNode) Stop(log *logger.Logger) {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("TelegramListenNode %s is not running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusStopped)
	log.Infof("Stopping TelegramListenNode with UID: %s", n.NodeUid)

	n.UnSubscribe()
	n.Cancel()
}

func (n *TelegramListenNode) chatUserName(chatId int64) string {
	return fmt.Sprintf("telegram_chat_%d", chatId)
}
