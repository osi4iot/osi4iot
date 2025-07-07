package nodes

import (
	"context"
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
	ctx, cancel := context.WithCancel(context.Background())
	return &EmailNode{
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
			Type:    "EmailNode",
			Fm:      fm,
			Cancel:  cancel,
			Ctx:     ctx,
		},
		SMTPServer: "smtp.gmail.com",
		From:       fm.GetPlatformEmailUsername(),
		To:         fm.GetGroupNotificationEmail(),
		Username:   fm.GetPlatformEmailUsername(),
		Password:   fm.GetPlatformEmailPassword(),
	}
}

func (n *EmailNode) Start(log *logger.Logger) {
	log.Infof("Starting EmailNode with UID: %s", n.NodeUid)
	nodeInputWires := n.Fm.GetNodeInputWires(n.DigitalTwinId, n.Id)

	if len(nodeInputWires) == 0 {
		log.Errorf("No input wires found for EmailNode with UID: %s", n.NodeUid)
		return
	}

	for i, wire := range nodeInputWires {
		go func(channelIndex int, inputWire *common.Wire) {
			for {
				select {
				case <-n.Ctx.Done():
					log.Infof("Stopping EmailNode channel %d with UID: %s", channelIndex, n.NodeUid)
					return
				case msg, ok := <-inputWire.Channel:
					if !ok {
						log.Infof("Channel closed for EmailNode with UID: %s", n.NodeUid)
						return
					}

					payload := msg.Payload.(map[string]interface{})
					message, ok1 := payload["message"].(string)
					subject, ok2 := payload["subject"].(string)
					if ok1 && ok2 {
						err := utils.SendEmail(n.SMTPServer, n.From, n.To, subject, message, n.Username, n.Password)
						if err != nil {
							log.Errorf("Failed to send email: %v", err)
						}
					} else {
						log.Errorf("Invalid message format in EmailNode with UID: %s", n.NodeUid)
					}
				}
			}
		}(i, wire)
	}
}
