package flow

import (
	"context"
	"fmt"
	"org_flows/common"
	"org_flows/config"
	"org_flows/logger"
	nats_pkg "org_flows/nats"
	"org_flows/nodes"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

func CreateFlow(configFlow config.Flow,
	orgHash string,
	telegramBotToken string,
	emailUsername string,
	emailPassword string,
	natsConn *nats.Conn,
	js jetstream.JetStream,
	log *logger.Logger,
) common.Flow {
	kv, err := nats_pkg.CreateFlowKeyValueStore(orgHash, configFlow.FlowUID, log, js)
	if err != nil {
		log.Fatal("Application startup failed")
	}

	flow := common.Flow{
		FlowUID:                configFlow.FlowUID,
		GroupID:                configFlow.GroupID,
		AssetID:                configFlow.AssetID,
		DigitalTwinID:          configFlow.DigitalTwinID,
		Nats:                   natsConn,
		JetStream:              js,
		KeyValueStore:          kv,
		TelegramBotToken:       telegramBotToken,
		TelegramChatID:         configFlow.GroupTelegramChatID,
		GroupNotificationEmail: configFlow.GroupNotificationEmail,
		PlatformEmailUsername:  emailUsername,
		PlatformEmailPassword:  emailPassword,
		Nodes:                  make(map[string]common.Node),
		Children:               make(map[string][]string),
		Channels:               make(map[string]chan common.Message),
	}

	for _, nodeConfig := range configFlow.Nodes {
		node := nodes.CreateNode(nodeConfig, flow, log)
		nodeUid := node.GiveUid()
		flow.Nodes[nodeUid] = node
		if nodeConfig.Children != nil {
			flow.Children[nodeUid] = nodeConfig.Children
			for _, childUid := range nodeConfig.Children {
				newChannel := make(chan common.Message)
				flow.Channels[childUid] = newChannel
			}
		} else {
			flow.Children[nodeUid] = []string{}
			flow.Channels[nodeUid] = nil
		}
	}

	key := fmt.Sprintf("org_%s.flow_%s", flow.OrgHash, flow.FlowUID)
	_, err = flow.KeyValueStore.Get(context.Background(), key)
	if err == jetstream.ErrKeyNotFound {
		flow.KeyValueStore.Put(context.Background(), key, []byte("{}"))
	}

	return flow
}
