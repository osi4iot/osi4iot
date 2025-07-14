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
	SMTPServer string
	From       string
	To         string
	Username   string
	Password   string
}

func CreateEmailNode(node common.NodeData, fm common.Manager) *EmailNode {
	org :=fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	ctx, cancel := context.WithCancel(context.Background())
	return &EmailNode{
		BaseNode: BaseNode{
			Id:      node.Id,
			NodeUid: node.NodeUid,
			OrgId:   node.OrgId,
			OrgHash: org.OrgHash,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			GroupId: node.GroupId,
			AssetId: node.AssetId,
			DigitalTwinId: node.DigitalTwinId,
			Name:    node.Name,
			Xpos:    node.Xpos,
			Ypos:    node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings: node.Settings,
			Type:    "Email",
			Fm:      fm,
			Cancel:  cancel,
			Ctx:     ctx,
			status:  common.NodeStatusCreated,
		},
		SMTPServer: "smtp.gmail.com",
		From:       fm.GetPlatformEmailUsername(),
		To:         fm.GetGroupNotificationEmail(),
		Username:   fm.GetPlatformEmailUsername(),
		Password:   fm.GetPlatformEmailPassword(),
	}
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
	message, ok1 := msg.Payload["message"].(string)
	subject, ok2 := msg.Payload["subject"].(string)

	if !ok1 || !ok2 {
		return fmt.Errorf("missing message or subject in EmailNode with UID: %s", n.NodeUid)
	}

	return utils.SendEmail(n.SMTPServer, n.From, n.To, subject, message, n.Username, n.Password)
}
