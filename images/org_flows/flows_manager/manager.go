package flows_manager

import (
	"org_flows/common"
	"org_flows/config"
	"org_flows/flow"
	"org_flows/logger"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type FlowsManager struct {
	OrgId         int
	OrgHash       string
	NumReplicas   int
	ReplicaIndex  int
	Groups        []common.Group
	Assets        []common.Asset
	DigitalTwins  []common.DigitalTwin
	FlowMap       map[string]common.Flow
}


func CreateFlowsManager(
	config *config.Config,
	natsConn *nats.Conn,
	jetStream jetstream.JetStream,
	log *logger.Logger,
) *FlowsManager {
	flowManager := FlowsManager{
		OrgId:         config.OrgId,
		OrgHash:       config.OrgHash,
		NumReplicas:   config.NumReplicas,
		ReplicaIndex:  config.ReplicaIndex,
		Groups:        []common.Group{},
		Assets:        []common.Asset{},
		DigitalTwins:  []common.DigitalTwin{},
		FlowMap:       make(map[string]common.Flow),
	}

	for _, flowData := range config.Flows {
		flow := flow.CreateFlow(
			flowData, config.OrgHash, config.TelegramBotToken, 
			config.EmailUsername, config.EmailPassword, natsConn, 
			jetStream, log,
		)
		flow.Start(log)
		flowManager.FlowMap[flow.FlowUID] = flow
	}

	return &flowManager
}