package common

import (
	"pipelines/logger"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type Manager interface {
	AddOrg(org *Org)
	AddOrgs(orgs []*Org)
	GetOrg(orgId int) *Org
	GetOrgs() []*Org
	DeleteOrg(orgId int) error
	UpdateOrg(org *Org) error

	AddGroup(group *Group)
	GetGroup(groupId int) *Group
	GetGroups() []*Group
	DeleteGroup(groupId int) error
	UpdateGroup(group *Group) error

	AddAsset(asset *Asset)
	GetAsset(assetId int) *Asset
	DeleteAsset(assetId int) error
	UpdateAsset(asset *Asset) error

	AddSensor(sensor *Sensor)
	AddSensors(sensors []*Sensor)
	GetSensor(sensorId int) *Sensor
	GetSensors() []*Sensor
	DeleteSensor(sensorId int) error
	UpdateSensor(sensor *Sensor) error

	AddTopic(topic *Topic)
	AddTopics(topics []*Topic)
	GetTopic(topicId int) *Topic
	GetTopics() []*Topic
	DeleteTopic(topicId int) error
	UpdateTopic(topic *Topic) error

	AddDigitalTwin(digitalTwin *DigitalTwin)
	GetDigitalTwin(digitalTwinId int) *DigitalTwin
	DeleteDigitalTwin(digitalTwinId int) error
	UpdateDigitalTwin(digitalTwin *DigitalTwin) error

	AddNode(node *NodeData)
	AddNodes(nodes []*NodeData)
	GetNode(nodeId int) *Node
	GetNodes() []*Node
	DeleteNode(nodeId int) error
	UpdateNode(node *NodeData) error
	GetDigitalTwinNodes(digitalTwinId int) []*Node
	GetDigitalTwinKvStore(digitalTwinId int) jetstream.KeyValue
	
	AddWire(wire *Wire)
	AddWires(wires []*Wire)
	GetWire(wireId int) *Wire
	GetWires() []*Wire
	DeleteWire(wireId int) error
	UpdateWire(wire *Wire) error
	AddWireToDigitalTwin(fdigitalTwinId int, wire *Wire) error
	GetDigitalTwinWires(digitalTwinId int) []*Wire
    GetNodeOutputWires(digitalTwinId int, nodeId int) [][]*Wire 
    GetNodeInputWires(digitalTwinId int, nodeId int) []*Wire
    GetNodeOutputIndex(digitalTwinId int, nodeId int, outputIndex int) []*Wire

	NatsSubscribe(subject string, handler nats.MsgHandler) (*nats.Subscription, error)
	NatsPublish(subject string, msg []byte) error

	Log() *logger.Logger

	GetPlatformEmailUsername() string
	GetPlatformEmailPassword() string
	GetPlatformTelegramBotToken() string
	GetGroupNotificationEmail() string
	GetGroupTelegramChatID() int64

	StartNodes()
	StopNodes()

	StartNodesInDigitalTwin(digitalTwinId int)
	RestartNodesInDigitalTwin(digitalTwinId int)
	StopNodesInDigitalTwin(digitalTwinId int)
	RegenerateNodesInDigitalTwin(digitalTwinId int)
}
