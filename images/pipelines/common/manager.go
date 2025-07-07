package common

import (
	"pipelines/logger"

	"github.com/nats-io/nats.go"
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
	// GetAssetsInOrg(orgId int, groupId int) []*Asset
	// GetAssetsInGroup(groupId int) []*Asset
	DeleteAsset(assetId int) error
	UpdateAsset(asset *Asset) error

	AddDigitalTwin(digitalTwin *DigitalTwin)
	GetDigitalTwin(digitalTwinId int) *DigitalTwin
	// GetDigitalTwinsInOrg(orgId int, groupId int) []*DigitalTwin
	// GetDigitalTwinsInGroup(groupId int) []*DigitalTwin
	DeleteDigitalTwin(digitalTwinId int) error
	UpdateDigitalTwin(digitalTwin *DigitalTwin) error

	AddNode(node *NodeData)
	AddNodes(nodes []*NodeData)
	GetNode(nodeId int) *Node
	GetNodes() []*Node
	DeleteNode(nodeId int) error
	UpdateNode(node *NodeData) error
	GetDigitalTwinNodes(digitalTwinId int) []*Node
	
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
    GetNodeOutputIndex(digitalTwinId int, nodeId int, outputIndex int) *Wire

	NatsSubscribe(subject string, handler nats.MsgHandler) (*nats.Subscription, error)
	NatsPublish(subject string, msg []byte) error

	Log() *logger.Logger

	GetPlatformEmailUsername() string
	GetPlatformEmailPassword() string
	GetPlatformTelegramBotToken() string
	GetGroupNotificationEmail() string
	GetGroupTelegramChatID() int64
}
