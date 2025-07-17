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

func CreateTelegramNode(node common.NodeData, fm common.Manager) (*TelegramNode, error) {

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	logTopic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &TelegramNode{
		BaseNode: BaseNode{
			Id:             node.Id,
			NodeUid:        node.NodeUid,
			OrgId:          node.OrgId,
			OrgHash:        org.OrgHash,
			GroupId:        node.GroupId,
			AssetId:        node.AssetId,
			DigitalTwinId:  node.DigitalTwinId,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "Telegram",
			LogSubject:     logSubject,
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		ChatID:   fm.GetGroupTelegramChatID(),
		BotToken: fm.GetPlatformTelegramBotToken(),
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
	message, ok := msg.Payload["message"].(string)
	if !ok {
		return fmt.Errorf("missing message in TelegramNode with UID: %s", n.NodeUid)
	}

	return utils.SendTelegramMessage(n.BotToken, n.ChatID, message, log)
}
