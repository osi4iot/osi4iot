package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strconv"
)

type TelegramNode struct {
	BaseNode
	BotToken        string
	ChatID          int64
	IsCustomMessage bool
	Message         string
}

func CreateTelegramNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*TelegramNode, error) {
	options, ok := node.Settings["options"].(string)
	if !ok || options == "" {
		return nil, fmt.Errorf("options setting is required")
	}

	chatID := int64(0)
	isCustomMessage := false
	message := ""
	switch options {
	case "Group notification options":
		chatID = fm.GetGroupTelegramChatID(p.GetGroupId())
	case "Custom telegram options":
		isCustomMessage = true
		chatIDStr, ok := node.Settings["chatId"].(string)
		if !ok || chatIDStr == "" {
			return nil, fmt.Errorf("chatId setting is required for custom options")
		}
		var err error
		chatID, err = strconv.ParseInt(chatIDStr, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid chatId setting for custom options: %v", err)
		}

		if message, ok = node.Settings["message"].(string); !ok || message == "" {
			return nil, fmt.Errorf("message setting is required for custom options")
		}
	default:
		return nil, fmt.Errorf("invalid options setting: %s", options)
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &TelegramNode{
		BaseNode: BaseNode{
			NodeUid:        node.NodeUid,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "Telegram",
			LogSubject:     logSubject,
			Fm:             fm,
			Pipeline:       p,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		ChatID:          chatID,
		BotToken:        fm.GetPlatformTelegramBotToken(),
		IsCustomMessage: isCustomMessage,
		Message:         message,
	}, nil
}

func (n *TelegramNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TelegramNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TelegramNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *TelegramNode) processMessage(msg common.Message, log *logger.Logger) error {
	message := n.Message
	if !n.IsCustomMessage {
		var ok bool
		message, ok = msg.Payload["message"].(string)
		if !ok {
			return fmt.Errorf("missing message in TelegramNode with UID: %s", n.NodeUid)
		}

	}

	return utils.SendTelegramMessage(n.BotToken, n.ChatID, message, log)
}
