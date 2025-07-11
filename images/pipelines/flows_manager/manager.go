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
	Sensors                  *common.ShardedSyncMap
	Topics                   *common.ShardedSyncMap
	AssetTopicsRef           *common.ShardedSyncMap
	DigitalTwinTopicsRef     *common.ShardedSyncMap
	MLModels                 *common.ShardedSyncMap
	DigitalTwins             *common.ShardedSyncMap
	Nodes                    *common.ShardedSyncMap
	Wires                    *common.ShardedSyncMap
	DigitalTwinNodes         *common.ShardedSyncMap // key: "digitalTwinId" -> []*Node (nodes that belong to the digital twin)
	DigitalTwinWires         *common.ShardedSyncMap // key: "digitalTwinId" -> []*Wire (wires that belong to the digital twin)
	NodeOutputWires          *common.ShardedSyncMap // key: "digitalTwinId:nodeID" -> [][]*Wire (wires that leave the node)
	NodeInputWires           *common.ShardedSyncMap // key: "digitalTwinId:nodeID" -> []*Wire (wires that arrive at the node)
	NodeOutputByIndex        *common.ShardedSyncMap // key: "digitalTwinId:nodeID:outputIndex" -> []*Wire
	Admin                    *admin.Admin
	JsConsumer               jetstream.Consumer
	log                      *logger.Logger
	NumReplicas              int
	ReplicaIndex             int
	ShardIndex               int
	Nats                     *nats.Conn
	JetStream                jetstream.JetStream
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
	sensors := admin.GetSensors()
	topics := admin.GetTopics()
	mlModels := admin.GetMlModels()
	digitalTwins := admin.GetDigitalTwins()
	assetsTopics := admin.GetAssetTopics()
	digitalTwinTopics := admin.GetDigitalTwinTopics()
	nodes := admin.GetNodes()
	wires := admin.GetWires()

	flowManager := FlowsManager{
		Orgs:                     common.NewShardedSyncMap(config.ShardCount),
		Groups:                   common.NewShardedSyncMap(config.ShardCount),
		Assets:                   common.NewShardedSyncMap(config.ShardCount),
		Sensors:                  common.NewShardedSyncMap(config.ShardCount),
		Topics:                   common.NewShardedSyncMap(config.ShardCount),
		AssetTopicsRef:           common.NewShardedSyncMap(config.ShardCount),
		DigitalTwinTopicsRef:     common.NewShardedSyncMap(config.ShardCount),
		MLModels:                 common.NewShardedSyncMap(config.ShardCount),
		DigitalTwins:             common.NewShardedSyncMap(config.ShardCount),
		Nodes:                    common.NewShardedSyncMap(config.ShardCount),
		Wires:                    common.NewShardedSyncMap(config.ShardCount),
		DigitalTwinNodes:         common.NewShardedSyncMap(config.ShardCount / 2),
		DigitalTwinWires:         common.NewShardedSyncMap(config.ShardCount / 2),
		NodeOutputWires:          common.NewShardedSyncMap(config.ShardCount),
		NodeInputWires:           common.NewShardedSyncMap(config.ShardCount),
		NodeOutputByIndex:        common.NewShardedSyncMap(config.ShardCount),
		NumReplicas:              config.NumReplicas,
		ReplicaIndex:             config.ReplicaIndex,
		ShardIndex:               config.ShardIndex,
		Admin:                    admin,
		JsConsumer:               jsConsumer,
		Nats:                     natsConn,
		JetStream:                jetStream,
		PlatformEmailUsername:    config.PlatformEmailUsername,
		PlatformEmailPassword:    config.PlatformEmailPassword,
		PlatformTelegramBotToken: config.PlatformTelegramBotToken,
		GroupNotificationEmail:   config.GroupNotificationEmail,
		GroupTelegramChatID:      config.GroupTelegramChatID,
		log:                      log,
	}

	flowManager.AddOrgs(orgs)
	flowManager.AddGroups(groups)
	flowManager.AddAssets(assets)
	flowManager.AddSensors(sensors)
	flowManager.AddTopics(topics)
	flowManager.AddMlModels(mlModels)
	flowManager.AddDigitalTwins(digitalTwins)
	flowManager.AddAssetTopicsRef(assetsTopics)
	flowManager.AddDigitalTwinTopicsRef(digitalTwinTopics)
	flowManager.AddNodes(nodes)
	flowManager.AddWires(wires)

	flowManager.Listen()
	flowManager.StartNodes()

	return &flowManager
}

func (fm *FlowsManager) Listen() {
	fm.JsConsumer.Consume(func(msg jetstream.Msg) {
		var adminMsg common.AdminMessage
		if err := json.Unmarshal(msg.Data(), &adminMsg); err != nil {
			fm.log.Errorf("Failed to unmarshal message: %v", err)
			return
		}
		fm.log.Infof("Received message in pipeline admin => component: %s, action: %s, id: %d",
			adminMsg.Component, adminMsg.Action, adminMsg.Id)

		switch adminMsg.Component {
		case "org":
			switch adminMsg.Action {
			case "create":
				org := fm.Admin.GetOrg(adminMsg.Id)
				fm.AddOrg(org)
			case "update":
				org := fm.Admin.GetOrg(adminMsg.Id)
				fm.UpdateOrg(org)
			case "delete":
				fm.DeleteOrg(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "group":
			switch adminMsg.Action {
			case "create":
				group := fm.Admin.GetGroup(adminMsg.Id)
				fm.AddGroup(group)
			case "update":
				group := fm.Admin.GetGroup(adminMsg.Id)
				fm.UpdateGroup(group)
			case "delete":
				fm.DeleteGroup(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "asset":
			groupId := adminMsg.Context["groupId"]
			switch adminMsg.Action {
			case "create":
				asset := fm.Admin.GetAsset(groupId, adminMsg.Id)
				fm.AddAsset(asset)
			case "update":
				asset := fm.Admin.GetAsset(groupId, adminMsg.Id)
				fm.UpdateAsset(asset)
			case "delete":
				fm.DeleteAsset(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "sensor":
			groupId := adminMsg.Context["groupId"]
			switch adminMsg.Action {
			case "create":
				sensor := fm.Admin.GetSensor(groupId, adminMsg.Id)
				fm.AddSensor(sensor)
			case "update":
				sensor := fm.Admin.GetSensor(groupId, adminMsg.Id)
				fm.UpdateSensor(sensor)
			case "delete":
				fm.DeleteSensor(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "topic":
			groupId := adminMsg.Context["groupId"]
			switch adminMsg.Action {
			case "create":
				topic := fm.Admin.GetTopic(groupId, adminMsg.Id)
				fm.AddTopic(topic)
			case "update":
				topic := fm.Admin.GetTopic(groupId, adminMsg.Id)
				fm.UpdateTopic(topic)
			case "delete":
				fm.DeleteTopic(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "ml_model":
			groupId := adminMsg.Context["groupId"]
			switch adminMsg.Action {
			case "create":
				mlModel := fm.Admin.GetMlModel(groupId, adminMsg.Id)
				fm.AddMlModel(mlModel)
			case "update":
				mlModel := fm.Admin.GetMlModel(groupId, adminMsg.Id)
				fm.UpdateMlModel(mlModel)
			case "delete":
				fm.DeleteMlModel(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "digitalTwin":
			groupId := adminMsg.Context["groupId"]
			switch adminMsg.Action {
			case "create":
				digitalTwin := fm.Admin.GetDigitalTwin(groupId, adminMsg.Id)
				fm.AddDigitalTwin(digitalTwin)
			case "update":
				digitalTwin := fm.Admin.GetDigitalTwin(groupId, adminMsg.Id)
				fm.UpdateDigitalTwin(digitalTwin)
			case "delete":
				fm.DeleteDigitalTwin(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "node":
			groupId := adminMsg.Context["groupId"]
			switch adminMsg.Action {
			case "create":
				node := fm.Admin.GetNode(groupId, adminMsg.Id)
				fm.AddNode(node)
			case "update":
				node := fm.Admin.GetNode(groupId, adminMsg.Id)
				fm.UpdateNode(node)
			case "delete":
				fm.DeleteNode(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "wire":
			groupId := adminMsg.Context["groupId"]
			switch adminMsg.Action {
			case "create":
				wire := fm.Admin.GetWire(groupId, adminMsg.Id)
				fm.AddWire(wire)
			case "update":
				wire := fm.Admin.GetWire(groupId, adminMsg.Id)
				fm.UpdateWire(wire)
			case "delete":
				fm.DeleteWire(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		case "pipeline_action":
			switch adminMsg.Action {
			case "stop":
				fm.StopNodesInDigitalTwin(adminMsg.Id)
			case "start":
				fm.StartNodesInDigitalTwin(adminMsg.Id)
			case "restart":
				fm.RestartNodesInDigitalTwin(adminMsg.Id)
			default:
				fm.log.Errorf("Unknown action: %s for component: %s", adminMsg.Action, adminMsg.Component)
				return
			}
		default:
			fm.log.Errorf("Unknown component: %s", adminMsg.Component)
			return
		}

		msg.Ack()
		fm.log.Infof("Message in pipeline admin => component: %s, action: %s, id: %d processed successfully",
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
