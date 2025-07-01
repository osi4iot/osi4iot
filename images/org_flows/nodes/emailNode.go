package nodes

import (
	"context"
	"org_flows/common"
	"org_flows/logger"
	"org_flows/utils"
)

type EmailNode struct {
	BaseNode
	SMTPServer string
	From       string
	To         string
	Username   string
	Password   string
}

func CreateEmailNode(nodeUid string, flow common.Flow) *EmailNode {
	ctx, cancel := context.WithCancel(context.Background())
	return &EmailNode{
		BaseNode: BaseNode{
			Uid:    nodeUid,
			Type:   "EmailNode",
			Flow:   flow,
			Cancel: cancel,
			Ctx:    ctx,
		},
		SMTPServer: "smtp.gmail.com",
		From:       flow.PlatformEmailUsername,
		To:         flow.GroupNotificationEmail,
		Username:   flow.PlatformEmailUsername,
		Password:   flow.PlatformEmailPassword,
	}
}

func (n *EmailNode) Start(log *logger.Logger) {
	log.Infof("Starting EmailNode with UID: %s", n.Uid)
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
				message, ok1 := payload["message"].(string)
				subject, ok2 := payload["subject"].(string)
				if ok1 && ok2 {
					err := utils.SendEmail(n.SMTPServer, n.From, n.To, subject, message, n.Username, n.Password)
					if err != nil {
						log.Errorf("Failed to send email: %v", err)
					}
				} else {
					log.Errorf("Invalid message format in EmailNode with UID: %s", n.Uid)
				}
			}
		}
	}()
}
