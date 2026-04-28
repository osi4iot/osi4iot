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
	case "Use message from incoming payload":
		botToken = org.TelegramBotToken
	case "Custom message":
		isCustomMessage = true
		if messageToSend, ok = node.Settings["messageToSend"].(string); !ok || messageToSend == "" {
			return nil, fmt.Errorf("message setting is required for custom options")
		}
	default:
		return nil, fmt.Errorf("invalid messageOptions setting: %s", messageOptions)
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

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
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		BotToken:        botToken,
		ChatID:          chatID,
		IsCustomMessage: isCustomMessage,
		MessageToSend:   messageToSend,
	}, nil
}

func (n *TelegramSendNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TelegramSendNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TelegramSendNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processSendMessage)
}

// processSendMessage dispatches to the appropriate sender based on the file
// attached to the message (image, audio) or falls back to plain text.
func (n *TelegramSendNode) processSendMessage(msg common.Message, log *logger.Logger) error {
	if msg.HasFile() {
		if msg.IsImage() {
			return n.sendImage(msg, log)
		}
		if msg.IsAudio() {
			return n.sendAudio(msg, log)
		}
		// Unknown file type: log a warning and fall through to text.
		log.Warnf("TelegramSendNode %s: unsupported file type '%s', falling back to text",
			n.NodeUid, msg.GetFile().ContentType)
	}

	return n.sendText(msg, log)
}

// sendText sends a plain or formatted text message to Telegram.
func (n *TelegramSendNode) sendText(msg common.Message, log *logger.Logger) error {
	text := n.MessageToSend
	opts := []telegram.MessageOption{}

	if !n.IsCustomMessage {
		var ok bool
		text, ok = msg.GetStringFromPayload("message")
		if !ok {
			return fmt.Errorf("TelegramSendNode %s: missing 'message' field in payload", n.NodeUid)
		}

		if parseMode, ok := msg.GetStringFromPayload("parseMode"); ok && parseMode != "" {
			if parseMode != telegram.ParseModeHTML && parseMode != telegram.ParseModeMarkdownV2 {
				log.Warnf("TelegramSendNode %s: invalid parse mode '%s', defaulting to no parse mode",
					n.NodeUid, parseMode)
			} else {
				opts = append(opts, telegram.WithParseMode(parseMode))
			}
		}
	}

	log.Infof("TelegramSendNode %s: sending text message", n.NodeUid)
	return telegram.SendTelegramMessage(n.BotToken, n.ChatID, text, log, opts...)
}

// sendImage sends the attached image to Telegram, with an optional caption.
func (n *TelegramSendNode) sendImage(msg common.Message, log *logger.Logger) error {
	file := msg.GetFile()
	log.Infof("TelegramSendNode %s: sending image '%s' (%s, %d bytes)",
		n.NodeUid, file.Name, file.ContentType, len(file.Data))

	opts := []telegram.PhotoOption{}
	if caption := n.captionFor(msg); caption != "" {
		opts = append(opts, telegram.WithCaption(caption))
	}

	return telegram.SendTelegramPhoto(n.BotToken, n.ChatID, file.Data, file.Name, log, opts...)
}

// sendAudio sends the attached audio file to Telegram, with an optional caption.
func (n *TelegramSendNode) sendAudio(msg common.Message, log *logger.Logger) error {
	file := msg.GetFile()
	log.Infof("TelegramSendNode %s: sending audio '%s' (%s, %d bytes)",
		n.NodeUid, file.Name, file.ContentType, len(file.Data))

	opts := []telegram.AudioOption{}
	if caption := n.captionFor(msg); caption != "" {
		opts = append(opts, telegram.WithAudioCaption(caption))
	}

	return telegram.SendTelegramAudio(n.BotToken, n.ChatID, file.Data, file.Name, log, opts...)
}

// captionFor returns the caption to attach alongside a media file.
// For custom-message nodes it uses the configured text; otherwise it reads the
// optional "message" field from the payload (empty string is acceptable).
func (n *TelegramSendNode) captionFor(msg common.Message) string {
	if n.IsCustomMessage {
		return n.MessageToSend
	}
	caption, _ := msg.GetStringFromPayload("message")
	return caption
}

func (n *TelegramSendNode) Stop(log *logger.Logger) {
	if n.GetStatus() != common.NodeStatusRunning {
		log.Infof("TelegramSendNode %s is not running", n.NodeUid)
		return
	}

	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait()
	n.SetStatus(common.NodeStatusStopped)
	log.Infof("TelegramSendNode %s stopped successfully", n.NodeUid)
}