package flows_manager

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/admin"
	"pipelines/common"
	"pipelines/config"
	"pipelines/logger"
	"pipelines/utils"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type FlowsManager struct {
	Orgs                     *common.ShardedSyncMap
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
	topics := admin.GetTopics()
	mlModels := admin.GetMlModels()
	digitalTwins := admin.GetDigitalTwins()
	assetsTopics := admin.GetAssetTopics()
	digitalTwinTopics := admin.GetDigitalTwinTopics()
	nodes := admin.GetNodes()
	wires := admin.GetWires()

	flowManager := FlowsManager{
		Orgs:                     common.NewShardedSyncMap(config.ShardCount),
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
	flowManager.AddTopics(topics)
	flowManager.AddAssetTopicsRef(assetsTopics)
	flowManager.AddDigitalTwinTopicsRef(digitalTwinTopics)
	flowManager.AddMlModels(mlModels)
	flowManager.AddDigitalTwins(digitalTwins)
	flowManager.AddNodes(nodes)
	flowManager.AddWires(wires)

	flowManager.Listen()
	flowManager.StartNodes()

	return &flowManager
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

func (fm *FlowsManager) isPipelineInitialized(digitalTwin *common.DigitalTwin) bool {
	kvstore := fm.GetDigitalTwinKvStore(digitalTwin.Id)
	orgHash := fm.GetOrg(digitalTwin.OrgId).OrgHash
	key := fmt.Sprintf("org_%s.dt_%s.kvstore.%s", orgHash, digitalTwin.DigitalTwinUID, "pipeline_initialized")

	var isPipelineInitialized bool
	err := kvstore.GetValue(context.Background(), key, &isPipelineInitialized)
	if err != nil {
		return false
	}

	return isPipelineInitialized
}

func (fm *FlowsManager) setPipelineInitialized(digitalTwin *common.DigitalTwin, isPipelineInitialized bool) error {
	kvstore := fm.GetDigitalTwinKvStore(digitalTwin.Id)
	orgHash := fm.GetOrg(digitalTwin.OrgId).OrgHash
	key := fmt.Sprintf("org_%s.dt_%s.kvstore.%s", orgHash, digitalTwin.DigitalTwinUID, "pipeline_initialized")

	err := kvstore.SetValue(context.Background(), key, isPipelineInitialized)
	if err != nil {
		fm.log.Errorf("Failed to set pipeline_initialized in kvstore for digital twin %d: %v", digitalTwin.Id, err)
		return err
	}
	fm.log.Infof("Pipeline initialization set to %v for digital twin %d", isPipelineInitialized, digitalTwin.Id)

	return nil
}

func (fm *FlowsManager) handleNodeError(n *common.NodeData, err error) {
	logTopic := fm.GetTopicByTopicRef(n.AssetId, n.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	if logSubject == "" {
		fm.Log().Errorf("Node %s encountered an error but no log subject is set", n.NodeUid)
		return
	}

	description := fmt.Sprintf("Error in a node type %s ", n.Type)
	logData := common.PipelineLog{
		Level:       "error",
		Component:   "node",
		Name:        n.Name,
		Uid:         n.NodeUid,
		Description: description,
		Message:     err.Error(),
	}

	if logJSON, marshallErr := json.Marshal(logData); marshallErr == nil {
		fm.NatsPublish(logSubject, logJSON)
	} else {
		fm.Log().Errorf("Failed to marshal log error data for node %s: %v", n.NodeUid, marshallErr)
	}
}
