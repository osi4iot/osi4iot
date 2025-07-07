package flows_manager

import (
	"encoding/json"
	"pipelines/admin"
	"pipelines/common"
	"pipelines/config"
	"pipelines/logger"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type FlowsManager struct {
	Orgs                     *common.ShardedSyncMap
	Groups                   *common.ShardedSyncMap
	Assets                   *common.ShardedSyncMap
	DigitalTwins             *common.ShardedSyncMap
	Nodes                    *common.ShardedSyncMap
	Wires                    *common.ShardedSyncMap
	KvStores                 *common.ShardedSyncMap // key: "digitalTwinId" -> jetstream.KeyValue
	DigitalTwinNodes         *common.ShardedSyncMap // key: "digitalTwinId" -> []*Node (nodes that belong to the digital twin)
	DigitalTwinWires         *common.ShardedSyncMap // key: "digitalTwinId" -> []*Wire (wires that belong to the digital twin)
	NodeOutputWires          *common.ShardedSyncMap // key: "digitalTwinId:nodeID" -> [][]*Wire (wires that leave the node)
	NodeInputWires           *common.ShardedSyncMap // key: "digitalTwinId:nodeID" -> []*Wire (wires that arrive at the node)
	NodeOutputByIndex        *common.ShardedSyncMap // key: "digitalTwinId:nodeID:outputIndex" -> *Wire
	Admin                    *admin.Admin
	JsConsumer               jetstream.Consumer
	log                      *logger.Logger
	NumReplicas              int
	ReplicaIndex             int
	ShardIndex               int
	Nats                     *nats.Conn
	JetStream                jetstream.JetStream
	KeyValueStore            jetstream.KeyValue
	PlatformEmailUsername    string
	PlatformEmailPassword    string
	PlatformTelegramBotToken string
	GroupNotificationEmail   string
	GroupTelegramChatID      int64
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
	nodes := admin.GetNodes()
	wires := admin.GetWires()

	// for _, org := range config.Orgs {
	// 	flows := make(map[string]*common.Flow)
	// 	for _, flowData := range org.Flows {
	// 		flow := flow.CreateFlow(
	// 			flowData, org.OrgHash, config.TelegramBotToken,
	// 			config.EmailUsername, config.EmailPassword, natsConn,
	// 			jetStream, log,
	// 		)
	// 		flows[flow.FlowUID] = &flow
	// 	}
	// 	orgs[org.OrgId].Flows = flows
	// }

	flowManager := FlowsManager{
		Orgs:             common.NewShardedSyncMap(config.ShardCount),
		Groups:           common.NewShardedSyncMap(config.ShardCount),
		Assets:           common.NewShardedSyncMap(config.ShardCount),
		DigitalTwins:     common.NewShardedSyncMap(config.ShardCount),
		Nodes:            common.NewShardedSyncMap(config.ShardCount),
		Wires:            common.NewShardedSyncMap(config.ShardCount),
		KvStores:         common.NewShardedSyncMap(config.ShardCount),
		DigitalTwinNodes: common.NewShardedSyncMap(config.ShardCount / 2),
		DigitalTwinWires: common.NewShardedSyncMap(config.ShardCount / 2),
		NodeOutputWires:  common.NewShardedSyncMap(config.ShardCount),
		NodeInputWires:   common.NewShardedSyncMap(config.ShardCount),
		NodeOutputByIndex: common.NewShardedSyncMap(config.ShardCount),
		NumReplicas:      config.NumReplicas,
		ReplicaIndex:     config.ReplicaIndex,
		ShardIndex:       config.ShardIndex,
		Admin:            admin,
		JsConsumer:       jsConsumer,
		Nats:             natsConn,
		JetStream:        jetStream,
		KeyValueStore:    nil, // Initialize if needed later
		PlatformEmailUsername:    config.PlatformEmailUsername,
		PlatformEmailPassword:    config.PlatformEmailPassword,
		PlatformTelegramBotToken: config.PlatformTelegramBotToken,
		GroupNotificationEmail:   config.GroupNotificationEmail,
		GroupTelegramChatID:      config.GroupTelegramChatID,
		log:              log,
	}

	flowManager.AddOrgs(orgs)
	flowManager.AddGroups(groups)
	flowManager.AddAssets(assets)
	flowManager.AddDigitalTwins(digitalTwins)
	flowManager.AddNodes(nodes)
	flowManager.AddWires(wires)

	// for _, org := range flowManager.Orgs {
	// 	for _, flow := range org.Flows {
	// 		flow.Start(log)
	// 	}
	// }

	flowManager.Listen()

	pipelineNodes := flowManager.GetNodes()
	for _, node := range pipelineNodes {
		(*node).Start(log)
	}

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

func (fm *FlowsManager) Log() *logger.Logger {
	return fm.log
}

func (fm *FlowsManager) GetPlatformEmailUsername() string {
	return fm.PlatformEmailUsername
}

func (fm *FlowsManager) GetPlatformEmailPassword() string {
	return fm.PlatformEmailPassword
}

func (fm *FlowsManager) GetPlatformTelegramBotToken() string {
	return fm.PlatformTelegramBotToken
}

func (fm *FlowsManager) GetGroupNotificationEmail() string {
	return fm.GroupNotificationEmail
}

func (fm *FlowsManager) GetGroupTelegramChatID() int64 {
	return fm.GroupTelegramChatID
}

func (fm *FlowsManager) NatsSubscribe(subject string, handler nats.MsgHandler) (*nats.Subscription, error) {
	subscription, err := fm.Nats.Subscribe(subject, handler)
	if err != nil {
		fm.log.Errorf("Failed to subscribe to subject %s: %v", subject, err)
		return nil, err
	}
	return subscription, nil
}

func (fm *FlowsManager) NatsPublish(subject string, msg []byte) error {
	if err := fm.Nats.Publish(subject, msg); err != nil {
		fm.log.Errorf("Failed to publish message to subject %s: %v", subject, err)
		return err
	}
	return nil
}
