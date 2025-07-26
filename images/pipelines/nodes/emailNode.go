package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
)

type EmailNode struct {
	BaseNode
	SMTPServer      string
	From            string
	To              string
	Username        string
	Password        string
	IsCustomMessage bool
	Subject         string
	Body            string
}

func CreateEmailNode(node common.NodeData, fm common.Manager) (*EmailNode, error) {
	toOptions, ok := node.Settings["toOptions"].(string)
	if !ok || toOptions == "" {
		return nil, fmt.Errorf("toOptions setting is required")
	}

	to := ""
	switch toOptions {
	case "Custom email":
		to, ok = node.Settings["to"].(string)
		if !ok || to == "" {
			return nil, fmt.Errorf("to setting is required")
		}
	case "Group email notification channel":
		to = fm.GetGroupNotificationEmail(node.GroupId)
	}

	if to == "" {
		return nil, fmt.Errorf("to setting is required")
	}

	messageOptions, ok := node.Settings["messageOptions"].(string)
	if !ok || messageOptions == "" {
		return nil, fmt.Errorf("messageOptions setting is required")
	}

	isCustomMessage := false
	subject := ""
	body := ""
	if messageOptions == "Custom message" {
		isCustomMessage = true
		if subject, ok = node.Settings["subject"].(string); !ok {
			return nil, fmt.Errorf("subject setting is required for custom message")
		}

		if body, ok = node.Settings["body"].(string); !ok {
			return nil, fmt.Errorf("body setting is required for custom message")
		}
	}

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	logTopic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &EmailNode{
		BaseNode: BaseNode{
			Id:             node.Id,
			NodeUid:        node.NodeUid,
			OrgId:          node.OrgId,
			OrgHash:        org.OrgHash,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			GroupId:        node.GroupId,
			AssetId:        node.AssetId,
			DigitalTwinId:  node.DigitalTwinId,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Debug:          node.Debug,
			Settings:       node.Settings,
			Type:           "Email",
			LogSubject:     logSubject,
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		SMTPServer:      "smtp.gmail.com",
		From:            fm.GetPlatformEmailUsername(),
		To:              to,
		Username:        fm.GetPlatformEmailUsername(),
		Password:        fm.GetPlatformEmailPassword(),
		IsCustomMessage: isCustomMessage,
		Subject:         subject,
		Body:            body,
	}, nil
}

func (n *EmailNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("EmailNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting EmailNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *EmailNode) processMessage(msg common.Message, log *logger.Logger) error {
	subject := n.Subject
	body := n.Body
	if !n.IsCustomMessage {
		emailSubject, ok2 := msg.Payload["emailSubject"].(string)
		emailBody, ok1 := msg.Payload["emailBody"].(string)

		if !ok1 || !ok2 {
			return fmt.Errorf("missing emailBody or emailSubject in Email node with UID: %s", n.NodeUid)
		}
		subject = emailSubject
		body = emailBody
	}

	err := utils.SendEmail(n.SMTPServer, n.From, n.To, subject, body, n.Username, n.Password)
	if err != nil {
		return fmt.Errorf("Failed to send email in EmailNode %s: %v", n.NodeUid, err)
	}

	return nil
}
