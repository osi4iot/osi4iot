package common

import (
	"pipelines/logger"
	nats_pkg "pipelines/nats"

	"github.com/nats-io/nats.go"
)

type Manager interface {
	DeleteAsset(assetId int) error
	AddAssetTopicRef(assetId int, topicId int, topicRef string)
	DeleteAssetTopic(assetId int, topicRef string) error
	DeleteAssetTopicRef(assetId int, topicRef string) error
	AddAssetTopicsRef(assetTopics []*AssetTopic)
	GetTopicByAssetId(assetId int, topicRef string) *Topic
	GetTopicsByAssetId(assetId int) map[string]*Topic

	GetDigitalTwins() []*DigitalTwin
	GetDigitalTwin(digitalTwinId int) *DigitalTwin
	AddDigitalTwin(digitalTwin *DigitalTwin)
	AddDigitalTwins(digitalTwins []*DigitalTwin)
	DeleteDigitalTwin(digitalTwinId int) error
	UpdateDigitalTwin(digitalTwin *DigitalTwin) error
	GetDigitalTwinKvStore(digitalTwinId int) *nats_pkg.KVStore
	AddDigitalTwinTopicsRef(digitalTwinTopics []*DigitalTwinTopic)
	AddDigitalTwinTopicRef(digitalTwinId int, topicRef string, topicId int) error
	GetTopicByADigitalTwinId(digitalTwinId int, topicRef string) *Topic
	GetTopicsByDigitalTwinId(digitalTwinId int) map[string]*Topic
	DeleteDigitalTwinTopicsRefByDTid(digitalTwinId int) error
	DeleteDigitalTwinTopicRef(digitalTwinId int, topicRef string) error

	GetMlModels() []*MLModel
	GetMlModel(modelId int) *MLModel
	AddMlModel(model *MLModel)
	AddMlModels(models []*MLModel)
	DeleteMlModel(modelId int) error
	UpdateMlModel(model *MLModel) error

	GetNode(nodeId int) Node
	GetNodes() []Node
	AddNode(node *NodeData) error
	AddNodes(nodes []*NodeData) error
	DeleteNode(nodeId int) error
	UpdateNode(node *NodeData) error
	GetDigitalTwinNodes(digitalTwinId int) []Node

	StartNodes()
	StopNodes()

	StartNodesInDigitalTwin(digitalTwinId int, needReinitialization bool)
	RestartNodesInDigitalTwin(digitalTwinId int, needReinitialization bool)
	StopNodesInDigitalTwin(digitalTwinId int, action string)
	RegenerateNodesInDigitalTwin(digitalTwinId int)

	GetOrgs() []*Org
	GetOrg(orgId int) *Org
	AddOrg(org *Org)
	AddOrgs(orgs []*Org)
	DeleteOrg(orgId int) error
	UpdateOrg(org *Org) error

	GetGroups() []*Group
	GetGroup(groupId int) *Group
	AddGroup(group *Group)
	AddGroups(groups []*Group)
	DeleteGroup(groupId int) error
	UpdateGroup(group *Group) error

	GetNotificationChannels() []*NotificationChannel
	GetNotificationChannel(channelId int) *NotificationChannel
	AddNotificationChannel(channel *NotificationChannel)
	AddNotificationChannels(channels []*NotificationChannel)
	DeleteNotificationChannel(channelId int) error
	UpdateNotificationChannel(channel *NotificationChannel) error

	DeleteSensor(sensorId int) error

	GetTopics() []*Topic
	GetTopic(topicId int) *Topic
	AddTopic(topic *Topic)
	AddTopics(topics []*Topic)
	DeleteTopic(topicId int) error
	UpdateTopic(topic *Topic) error
	GetTopicByTopicRef(assetId int, digitalTwinId int, topicRef string) *Topic

	GetWire(wireId int) *Wire
	GetWires() []*Wire
	AddWire(wire *Wire)
	AddWires(wires []*Wire)
	DeleteWire(wireId int) error
	UpdateWire(wire *Wire) error
	AddWireToDigitalTwin(digitalTwinId int, wire *Wire) error
	GetDigitalTwinWires(digitalTwinId int) []*Wire
	GetNodeOutputWires(digitalTwinId int, nodeId int) [][]*Wire
	GetNodeInputWires(digitalTwinId int, nodeId int) []*Wire
	GetNodeOutputIndex(digitalTwinId int, nodeId int, outputIndex int) []*Wire

	GetNatsClient() *nats.Conn
	NatsSubscribe(subject string, handler nats.MsgHandler) (*nats.Subscription, error)
	NatsQueueSubscribe(subject, queue string, handler nats.MsgHandler) (*nats.Subscription, error)
	NatsPublish(subject string, msg []byte) error

	Log() *logger.Logger

	GetMode() string
	GetPlatformEmailUsername() string
	GetPlatformEmailPassword() string
	GetPlatformTelegramBotToken() string
	GetGroupNotificationEmail(groupId int) string
	GetGroupTelegramChatID(groupId int) int64

	GetFunctionsTimeout() int

	GetNumReplicas() int
	GetReplicaIndex() int
	IsRaftLeader() bool

	GetLlmProviderApiKey() string
	GetLlmProviderUrl() string
	GetDefaultLlmModel() string
	GetDefaultLlmTemperature() float32
	GetLlmMaxTokens() int
	GetMcpServersPath() string
	GetMaxChatMessagesPerUser() int

	GetFemResultsInfo(groupId int, digitalTwinId int) []*FemResultsInfo
	GetFemResultsPath() string
}
