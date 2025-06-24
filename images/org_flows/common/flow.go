package common

import (
	"org_flows/logger"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type Flow struct {
	OrgHash          string
	FlowUID          string
	GroupID          int
	AssetID          int
	DigitalTwinID    int
	Nats             *nats.Conn
	JetStream        jetstream.JetStream
	KeyValueStore    jetstream.KeyValue
	TelegramBotToken string
	TelegramChatID   int64
	NotificationEmail string
	EmailUsername     string
	EmailPassword     string
	Nodes            map[string]Node
	Children         map[string][]string
	Channels         map[string]chan Message
}

func (flow *Flow) Start(log *logger.Logger) {
	log.Infof("Starting flow with UID: %s", flow.FlowUID)
	for _, node := range flow.Nodes {
		node.Start(log)
	}
}

func (flow *Flow) Stop(log *logger.Logger) {
	log.Infof("Stopping flow with UID: %s", flow.FlowUID)
	for _, node := range flow.Nodes {
		node.Stop(log)
		nodeUid := node.GiveUid()
		for _, childUid := range flow.Children[nodeUid] {
			if channel, exists := flow.Channels[childUid]; exists {
				close(channel)
				delete(flow.Channels, childUid)
			}
		}
		delete(flow.Children, nodeUid)
		delete(flow.Nodes, nodeUid)
	}
}
