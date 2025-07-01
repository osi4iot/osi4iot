package flows_manager

import (
	"encoding/json"
	"org_flows/admin"
	"org_flows/common"
	"org_flows/config"
	"org_flows/flow"
	"org_flows/logger"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type FlowsManager struct {
	Orgs         map[int]*common.Org
	Groups       map[int]*common.Group
	Assets       map[int]*common.Asset
	DigitalTwins map[int]*common.DigitalTwin
	Admin        *admin.Admin
	JsConsumer   jetstream.Consumer
	log          *logger.Logger
	NumReplicas  int
	ReplicaIndex int
	ShardIndex   int
}

func CreateFlowsManager(
	config *config.Config,
	natsConn *nats.Conn,
	jetStream jetstream.JetStream,
	jsConsumer jetstream.Consumer,
	admin *admin.Admin,
	log *logger.Logger,
) *FlowsManager {
	orgs := admin.GetOrgs()
	groups := admin.GetGroups()
	assets := admin.GetAssets()
	digitalTwins := admin.GetDigitalTwins()
	
	for _, org := range config.Orgs {
		flows := make(map[string]*common.Flow)
		for _, flowData := range org.Flows {
			flow := flow.CreateFlow(
				flowData, org.OrgHash, config.TelegramBotToken,
				config.EmailUsername, config.EmailPassword, natsConn,
				jetStream, log,
			)
			flows[flow.FlowUID] = &flow
		}
		orgs[org.OrgId].Flows = flows
	}

	flowManager := FlowsManager{
		Orgs:         orgs,
		Groups:       groups,
		Assets:       assets,
		DigitalTwins: digitalTwins,
		NumReplicas:  config.NumReplicas,
		ReplicaIndex: config.ReplicaIndex,
		ShardIndex:   config.ShardIndex,
		Admin:        admin,
		JsConsumer:   jsConsumer,
		log:          log,
	}

	for _, org := range flowManager.Orgs {
		for _, flow := range org.Flows {
			flow.Start(log)
		}
	}

	flowManager.Listen()

	return &flowManager
}

func (fm *FlowsManager) Listen() {
	fm.JsConsumer.Consume(func(msg jetstream.Msg) {
		var adminMsg common.AdminMessage
		if err := json.Unmarshal(msg.Data(), &adminMsg); err != nil {
			fm.log.Errorf("Failed to unmarshal message: %v", err)
			return
		}
		switch adminMsg.Component {
		case "org":
			switch adminMsg.Action {
			case "create":
				fm.Admin.GetOrg(adminMsg.Id)
			case "update":
				// Handle update logic here
			case "delete":
				// Handle delete logic here
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "group":
			// Handle group actions here
		case "asset":
			// Handle asset actions here
		case "digitalTwin":
			// Handle digital twin actions here
		case "flow":
			// Handle flow actions here
		case "node":
			// Handle node actions here
		default:
			fm.log.Errorf("Unknown component: %s", adminMsg.Component)
			return
		}

		msg.Ack()
		fm.log.Infof("Received message in org flows admin => component: %s, action: %s, id: %d",
			adminMsg.Component, adminMsg.Action, adminMsg.Id)
	})
}
