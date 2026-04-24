package nodes

import (
	"context"
	"fmt"
	"os"

	// "os"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/telegram"
	"pipelines/utils"
	"strconv"
	"strings"
)

type TelegramListenNode struct {
	BaseNode
	BotToken                 string
	ChatID                   int64
	GroupUid                 string
	AssetUid                 string
	GroupAcronym             string
	TelegramListener         *telegram.OrgListener
	ListenMsgChannel         chan *telegram.TelegramMessage
	UnSubscribe              context.CancelFunc
	ClearChatMessagesHistory func(ctx context.Context, userName string)
}

type AssetState struct {
	AssetUid string
	status   string
}

type TelegramCommand struct {
	Command     string
	Description string
}

var TelegramCommands = []TelegramCommand{
	{Command: "/start", Description: "Show welcome message and available commands"},
	{Command: "/state", Description: "Get current states of all assets in the group"},
	{Command: "/assets", Description: "Get a list of all assets in the group with status emojis"},
	{Command: "/asset [asset_uid]", Description: "Get detailed information about an asset. If asset_uid is not provided, it defaults to the node's asset."},
	{Command: "/clear", Description: "Clear chat history"},
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

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	group := fm.GetGroup(p.GetGroupId())
	groupUid := group.GroupUID
	assetId := p.GetAssetId()
	asset := fm.GetAssetById(assetId)
	assetUid := asset.AssetUid

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
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		BotToken:                 botToken,
		ChatID:                   chatID,
		GroupUid:                 groupUid,
		GroupAcronym:             group.Acronym,
		AssetUid:                 assetUid,
		TelegramListener:         telegramListener,
		ListenMsgChannel:         listenMsgChannel,
		UnSubscribe:              nil,
		ClearChatMessagesHistory: p.ClearChatMessagesHistory,
	}, nil
}

func (n *TelegramListenNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("TelegramListenNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting TelegramListenNode with UID: %s", n.NodeUid)

	unsubcribe := n.TelegramListener.Subscribe(n.ChatID, n.ListenMsgChannel)
	n.UnSubscribe = unsubcribe

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

			switch msg.Type {
			case telegram.MessageTypeCallback:
				// Siempre responder el callback para quitar el loading del botón
				telegram.AnswerCallbackQuery(n.BotToken, msg.CallbackQueryID, "")

				callbackData := msg.CallbackData
				parts := strings.Fields(callbackData)
				command := parts[0]
				param := ""
				if len(parts) > 1 {
					param = parts[1]
				}

				switch command {
				case "/asset":
					n.SendAssetCardImage(param, log)
					continue
				default:
					// unrecognized command, you can choose to send a message back or ignore
					log.Warnf("Unrecognized callback command: %s", command)
					continue
				}
			case telegram.MessageTypeAudio:
				outMsg, err := n.buildAudioMessage(msg, log)
				if err != nil {
					log.Errorf("TelegramListenNode %s: failed to process audio message: %v", n.NodeUid, err)
					continue
				}
				n.sendToOutputs(outMsg, log)
				continue

			case telegram.MessageTypeVoice:
				outMsg, err := n.buildAudioMessage(msg, log)
				if err != nil {
					log.Errorf("TelegramListenNode %s: failed to process voice message: %v", n.NodeUid, err)
					continue
				}
				n.sendToOutputs(outMsg, log)
				continue
			case telegram.MessageTypeText:
				if msg.Text == "/start" {
					var message strings.Builder
					fmt.Fprintf(&message, "<i>Welcome to the Telegram bot for group '%s'</i>\n\nYou can send the following commands:\n", n.GroupAcronym)
					for _, cmd := range TelegramCommands {
						fmt.Fprintf(&message, "\n%s - %s", cmd.Command, cmd.Description)
					}
					telegram.SendTelegramMessage(n.BotToken, n.ChatID, message.String(), log, telegram.WithParseMode(telegram.ParseModeHTML))
					continue
				} else if msg.Text == "/clear" {
					if n.ClearChatMessagesHistory != nil {
						n.ClearChatMessagesHistory(n.Ctx, n.chatUserName(msg.ChatID))
						message := "<i>Chat history cleared successfully</i>"
						telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
					}
					continue
				} else if msg.Text == "/state" {
					imageBytes := n.CreateAssetStatesTableImage(log)
					if imageBytes == nil {
						message := "<i>No asset states available</i>"
						telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
					} else {
						imgUid, err := utils.GenerateNanoID(10)
						if err != nil {
							log.Errorf("Error generating NanoID for asset states image: %v", err)
							message := "<i>Error generating asset states image</i>"
							telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
							continue
						}

						imagePath := fmt.Sprintf("/tmp/asset_states_%s.png", imgUid)
						err = telegram.SendTelegramPhoto(
							n.BotToken,
							n.ChatID,
							imageBytes,
							imagePath,
							log,
							telegram.WithPhotoParseMode(telegram.ParseModeHTML),
						)
						if err != nil {
							log.Errorf("Error sending asset states photo: %v", err)
							message := "<i>Error generating asset states image</i>"
							telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
						} else {
							os.Remove(imagePath) // Remove the temporary image file after sending
						}
					}
					continue
				} else if msg.Text == "/assets" {
					// Handle the /assets command
					assets := n.Fm.GetAssetsByGroupId(n.Pipeline.GetGroupId())
					if len(assets) == 0 {
						message := "<i>No assets found in the group</i>"
						telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
					} else {
						assetStates, err := n.GetAssetStatesInGroupFromGroupKvStore(n.GroupUid, log)
						if err != nil {
							log.Errorf("Error getting asset states for TelegramListenNode %s: %v", n.NodeUid, err)
							continue
						}

						var message strings.Builder
						fmt.Fprintf(&message, "<i>Assets in the group:</i>\n")
						var inlineKeyboardRows [][]telegram.InlineKeyboardButton = make([][]telegram.InlineKeyboardButton, 0)
						for _, asset := range assets {
							status := "Unknown"
							if state, ok := assetStates[asset.AssetUid]; ok {
								if s, ok := state["status"].(string); ok {
									status = s
								}
							}
							statusEmoji := telegram.GetEmoji(status)
							text := fmt.Sprintf("Asset_%s  %s", asset.AssetUid, statusEmoji)
							inlineKeyboardRows = append(inlineKeyboardRows, []telegram.InlineKeyboardButton{
								{
									Text:         text,
									CallbackData: fmt.Sprintf("/asset %s", asset.AssetUid),
								},
							})
						}
						telegram.SendTelegramMessage(
							n.BotToken,
							n.ChatID,
							message.String(),
							log,
							telegram.WithParseMode(telegram.ParseModeHTML),
							telegram.WithInlineKeyboard(inlineKeyboardRows),
						)
					}
					continue
				} else if msg.Text == "/asset" || strings.HasPrefix(msg.Text, "/asset ") {
					parts := strings.Fields(msg.Text)
					assetUid := n.AssetUid // default to node's asset if no UID provided
					if len(parts) > 1 {
						assetUid = parts[1]
					}
					n.SendAssetCardImage(assetUid, log)
					continue
				}
			}

			outputMsg := message.NewMessageFromPayload(map[string]any{
				"message_id": msg.MessageID,
				"chat_id":    msg.ChatID,
				"text":       msg.Text,
				"entities":   msg.Entities,
				"message":    msg.Text,
				"userName":   n.chatUserName(msg.ChatID),
			})

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
	if n.Cancel != nil {
		n.Cancel()
	}

	n.wg.Wait()
	n.SetStatus(common.NodeStatusStopped)
	log.Infof("Node %s stopped successfully", n.NodeUid)
}

func (n *TelegramListenNode) chatUserName(chatId int64) string {
	return fmt.Sprintf("telegram_chat_%d", chatId)
}

func (n *TelegramListenNode) CreateAssetStatesTable(log *logger.Logger) string {
	assetStates, err := n.GetAssetStatesInGroupFromGroupKvStore(n.GroupUid, log)
	if err != nil {
		log.Errorf("Error getting asset states for TelegramListenNode %s: %v", n.NodeUid, err)
		return ""
	}

	table := telegram.Table{
		Headers: []string{"Asset UID", "Status"},
	}

	for assetUid, state := range assetStates {
		status, _ := state["status"].(string)
		row := []string{assetUid, status}
		table.Rows = append(table.Rows, row)
	}

	return table.RenderTable()
}

func (n *TelegramListenNode) CreateAssetStatesTableImage(log *logger.Logger) []byte {
	assetStates, err := n.GetAssetStatesInGroupFromGroupKvStore(n.GroupUid, log)
	if err != nil {
		log.Errorf("Error getting asset states for TelegramListenNode %s: %v", n.NodeUid, err)
		return nil
	}

	groupId := n.Pipeline.GetGroupId()
	group := n.Fm.GetGroup(groupId)
	if group == nil {
		log.Errorf("Group with ID %d not found for TelegramListenNode %s", groupId, n.NodeUid)
		return nil
	}

	table := telegram.Table{
		Headers: []string{"Asset UID", "Status"},
	}

	for assetUid, state := range assetStates {
		status, _ := state["status"].(string)
		row := []string{assetUid, status}
		table.Rows = append(table.Rows, row)
	}

	tableTitle := fmt.Sprintf("Asset states for group: '%s'", group.Acronym)
	img, err := table.GenerateTableImage(tableTitle)
	if err != nil {
		log.Errorf("Error generating table image for TelegramListenNode %s: %v", n.NodeUid, err)
		return nil
	}

	return img
}

func (n *TelegramListenNode) CreateAssetCardImage(asset *common.Asset, log *logger.Logger) []byte {
	assetState, err := n.GetAssetStateFromGroupKvStore(asset.AssetUid, n.GroupUid)
	if err != nil {
		log.Errorf("Error getting asset state for asset %s in TelegramListenNode %s: %v", asset.AssetUid, n.NodeUid, err)
		return nil
	}
	assetStatus := "Unknown"
	if status, ok := assetState["status"].(string); ok {
		assetStatus = status
	}

	assetStateDescription := "State description not available"
	if desc, ok := assetState["state_description"].(string); ok {
		assetStateDescription = desc
	}

	group := n.Fm.GetGroup(n.Pipeline.GetGroupId())
	if group == nil {
		log.Errorf("Group with ID %d not found for TelegramListenNode %s", n.Pipeline.GetGroupId(), n.NodeUid)
		return nil
	}

	org := n.Fm.GetOrg(group.OrgId)
	if org == nil {
		log.Errorf("Organization with ID %d not found for TelegramListenNode %s", group.OrgId, n.NodeUid)
		return nil
	}

	card := &telegram.Card{
		Title: asset.Description,
		Fields: []telegram.CardField{
			{Label: "Status", Value: assetStatus},
			{Label: "Asset UID", Value: asset.AssetUid},
			{Label: "Type", Value: asset.AssetType},
			{Label: "Building Id", Value: fmt.Sprintf("%d", org.BuildingId)},
			{Label: "Floor", Value: fmt.Sprintf("%d", group.FloorNumber)},
			{Label: "Latitude", Value: fmt.Sprintf("%.16f", asset.Latitude)},
			{Label: "Longitude", Value: fmt.Sprintf("%.16f", asset.Longitude)},
		},
	}

	if assetStatus != "OK" {
		card.Fields = append(card.Fields, telegram.CardField{Label: "State description", Value: assetStateDescription})
	}

	imageBytes, err := card.GenerateCardImage()
	if err != nil {
		log.Errorf("Error generating asset card image for TelegramListenNode %s: %v", n.NodeUid, err)
		return nil
	}
	return imageBytes
}

func (n *TelegramListenNode) SendAssetCardImage(assetUid string, log *logger.Logger) {
	asset := n.Fm.GetAssetByShortUidAndGroupId(assetUid, n.Pipeline.GetGroupId())
	if asset == nil {
		message := fmt.Sprintf("<i>Asset with UID '%s' not found in group</i>", assetUid)
		telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
		return

	}

	imageBytes := n.CreateAssetCardImage(asset, log)
	if imageBytes == nil {
		message := "<i>No asset card available</i>"
		telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
	} else {
		imgUid, err := utils.GenerateNanoID(10)
		if err != nil {
			log.Errorf("Error generating NanoID for asset card image: %v", err)
			message := "<i>Error generating asset card image</i>"
			telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
			return
		}

		imagePath := fmt.Sprintf("/tmp/asset_card_%s.png", imgUid)
		err = telegram.SendTelegramPhoto(
			n.BotToken,
			n.ChatID,
			imageBytes,
			imagePath,
			log,
			telegram.WithPhotoParseMode(telegram.ParseModeHTML),
		)
		if err != nil {
			log.Errorf("Error sending asset card photo: %v", err)
			message := "<i>Error generating asset card image</i>"
			telegram.SendTelegramMessage(n.BotToken, n.ChatID, message, log, telegram.WithParseMode(telegram.ParseModeHTML))
		} else {
			os.Remove(imagePath) // Remove the temporary image file after sending
		}
	}
}

func (n *TelegramListenNode) buildAudioMessage(msg *telegram.TelegramMessage, log *logger.Logger) (*message.Message, error) {
	var fileID string
	var mimeType string
	var fileName string

	switch msg.Type {
	case telegram.MessageTypeAudio:
		if msg.Audio == nil {
			return nil, fmt.Errorf("audio message has no audio data")
		}
		fileID = msg.Audio.FileID
		mimeType = msg.Audio.MimeType
		if mimeType == "" {
			mimeType = "audio/mpeg"
		}
		title := msg.Audio.Title
		if title == "" {
			title = msg.Audio.FileUniqueID
		}
		fileName = fmt.Sprintf("%s.mp3", title)

	case telegram.MessageTypeVoice:
		if msg.Voice == nil {
			return nil, fmt.Errorf("voice message has no voice data")
		}
		fileID = msg.Voice.FileID
		mimeType = msg.Voice.MimeType
		if mimeType == "" {
			mimeType = "audio/ogg"
		}
		fileName = fmt.Sprintf("%s.ogg", msg.Voice.FileUniqueID)
	}

	log.Infof("TelegramListenNode %s: downloading audio file %s", n.NodeUid, fileID)
	data, _, err := telegram.DownloadFile(n.BotToken, fileID)
	if err != nil {
		return nil, fmt.Errorf("failed to download audio file: %w", err)
	}

	outMsg := message.NewMessage(
		"",
		map[string]any{
			"message_id": msg.MessageID,
			"chat_id":    msg.ChatID,
			"userName":   n.chatUserName(msg.ChatID),
		},
		nil,
		mimeType,
		&common.File{
			Name:        fileName,
			ContentType: mimeType,
			Data:        data,
		},
	)

	return outMsg, nil
}
