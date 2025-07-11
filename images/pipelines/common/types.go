package common

import (
	"context"
	"pipelines/logger"
	"pipelines/utils"

	"github.com/nats-io/nats.go/jetstream"
)

type AdminMessage struct {
	Component string         `json:"component"` // org, group, asset, digitalTwin, flow, node
	Action    string         `json:"action"`    // create, update, delete
	Id        int            `json:"id"`        // ID of the org, group, asset, digitalTwin, flow, or node
	Context   map[string]int `json:"context"`   // Contextual information (e.g., groupId, orgId, assetId, digitalTwinId)
}

type Message struct {
	Timestamp utils.Timestamp `json:"timestamp"`
	Subject   string          `json:"subject"`
	Payload   any             `json:"payload"`
	State     map[string]any  `json:"state"`
}

type NodeStatus int

const (
	NodeStatusCreated NodeStatus = iota
	NodeStatusUpdated
	NodeStatusRunning
	NodeStatusStopped
)

func (s NodeStatus) String() string {
	switch s {
	case NodeStatusCreated:
		return "created"
	case NodeStatusRunning:
		return "running"
	case NodeStatusStopped:
		return "stopped"
	case NodeStatusUpdated:
		return "updated"
	default:
		return "unknown"
	}
}

type Node interface {
	Start(log *logger.Logger)
	Stop(log *logger.Logger)
	GetId() int
	GetUid() string
	GetOrgId() int
	GetGroupId() int
	GetAssetId() int
	GetName() string
	GetType() string
	GetXpos() float64
	GetYpos() float64
	GetSettings() map[string]any
	GetNumOutputs() int
	GetDigitalTwinId() int
	GetStatus() NodeStatus
}

type Org struct {
	Id         int    `json:"id"`
	OrgHash    string `json:"orgHash"`
	Name       string `json:"name"`
	Acronym    string `json:"acronym"`
	Role       string `json:"role"`
	City       string `json:"city"`
	BuildingId int    `json:"buildingId"`
}

type Group struct {
	Id                            int    `json:"id"`
	OrgId                         int    `json:"orgId"`
	Name                          string `json:"name"`
	Acronym                       string `json:"acronym"`
	GroupUID                      string `json:"groupUid"`
	TelegramInvitationLink        string `json:"telegramInvitationLink"`
	TelegramChatID                string `json:"telegramChatID"`
	EmailNotificationChannelId    int    `json:"emailNotificationChannelId"`
	TelegramNotificationChannelId int    `json:"telegramNotificationChannelId"`
	IsOrgDefaultGroup             bool   `json:"isOrgDefaultGroup"`
	FloorNumber                   int    `json:"floorNumber"`
	FeatureIndex                  int    `json:"featureIndex"`
}

type Asset struct {
	Id          int     `json:"id"`
	OrgId       int     `json:"orgId"`
	GroupId     int     `json:"groupId"`
	AssetUid    string  `json:"assetUid"`
	Description string  `json:"description"`
	AssetType   string  `json:"assetType"`
	AssetTypeID int     `json:"assetTypeId"`
	Longitude   float64 `json:"longitude"`
	Latitude    float64 `json:"latitude"`
	Created     string  `json:"created"`
	Updated     string  `json:"updated"`
}

type Topic struct {
	Id                int    `json:"id"`
	OrgId             int    `json:"orgId"`
	GroupId           int    `json:"groupId"`
	TopicType         string `json:"topicType"`
	TopicName         string `json:"topicName"`
	Description       string `json:"description"`
	TopicUid          string `json:"topicUid"`
	MqttAccessControl string `json:"mqttAccessControl"`
	PayloadJsonSchema string `json:"payloadJsonSchema"`
	RequireS3Storage  bool   `json:"requireS3Storage"`
	S3Folder          string `json:"s3Folder"`
	LastS3Storage     string `json:"lastS3Storage"`
	ParquetSchema     string `json:"parquetSchema"`
	Created           string `json:"created"`
	Updated           string `json:"updated"`
}

type AssetTopic struct {
	AssetId  int `json:"assetId"`
	TopicId  int `json:"topicId"`
	TopicRef int `json:"topicRef"`
}

type Sensor struct {
	Id                int    `json:"id"`
	OrgId             int    `json:"orgId"`
	GroupId           int    `json:"groupId"`
	GroupUid          string `json:"groupUid"`
	AssetId           int    `json:"assetId"`
	AssetUid          string `json:"assetUid"`
	SensorUid         string `json:"sensorUid"`
	SensorRef         string `json:"sensorRef"`
	SensorType        string `json:"sensorType"`
	SensorTypeId      int    `json:"sensorTypeId"`
	TopicId           int    `json:"topicId"`
	TopicUid          string `json:"topicUid"`
	TopicRef          int    `json:"topicRef"`
	Description       string `json:"description"`
	DashboardId       int    `json:"dashboardId"`
	DashboardUrl      string `json:"dashboardUrl"`
	PayloadJsonSchema string `json:"payloadJsonSchema"`
	Created           string `json:"created"`
	Updated           string `json:"updated"`
}

type DigitalTwin struct {
	Id                          int            `json:"id"`
	GroupId                     int            `json:"groupId"`
	AssetId                     int            `json:"assetId"`
	OrgId                       int            `json:"orgId"`
	Scope                       string         `json:"scope"`
	DigitalTwinUID              string         `json:"digitalTwinUid"`
	Description                 string         `json:"description"`
	Type                        string         `json:"type"`
	DashboardID                 int            `json:"dashboardId"`
	MaxNumResFemFiles           int            `json:"maxNumResFemFiles"`
	ChatAssistantEnabled        bool           `json:"chatAssistantEnabled"`
	ChatAssistantLanguage       string         `json:"chatAssistantLanguage"`
	DigitalTwinSimulationFormat map[string]any `json:"digitalTwinSimulationFormat"`
	DashboardURL                string         `json:"dashboardUrl"`
	SensorsRef                  []string       `json:"sensorsRef"`
	Created                     string         `json:"created"`
	Updated                     string         `json:"updated"`

	KvStore jetstream.KeyValue
}

type DigitalTwinTopic struct {
	DigitalTwinId int `json:"digitalTwinId"`
	TopicId       int `json:"topicId"`
	TopicRef      int `json:"topicRef"`
}

type DigitalTwinSensor struct {
	DigitalTwinId int `json:"digitalTwinId"`
	SensorId      int `json:"sensorId"`
}

type MLModel struct {
	Id          int    `json:"id"`
	OrgId       int    `json:"orgId"`
	GroupId     int    `json:"groupId"`
	MLModelUid  string `json:"mlModelUid"`
	Description string `json:"description"`
	MLLibrary   string `json:"mlLibrary"`
	Created     string `json:"created"`
	Updated     string `json:"updated"`
}

type NodeData struct {
	Id            int            `json:"id"`
	NodeUid       string         `json:"nodeUid"`
	OrgId         int            `json:"orgId"`
	GroupId       int            `json:"groupId"`
	AssetId       int            `json:"assetId"`
	DigitalTwinId int            `json:"digitalTwinId"`
	Name          string         `json:"name"`
	Type          string         `json:"type"`
	Xpos          float64        `json:"x"`
	Ypos          float64        `json:"y"`
	Settings      map[string]any `json:"settings"`
	NumOutputs    int            `json:"numOutputs"`
}

type Wire struct {
	Id              int    `json:"id"`
	WireUid         string `json:"wireUid"`
	OrgId           int    `json:"orgId"`
	GroupId         int    `json:"groupId"`
	AssetId         int    `json:"assetId"`
	DigitalTwinId   int    `json:"digitalTwinId"`
	NodeIniId       int    `json:"nodeIniId"`
	NodeEndId       int    `json:"nodeEndId"`
	NiniOutputIndex int    `json:"niniOutputIndex"`

	Ctx        context.Context
	Cancel     context.CancelFunc
	BufferSize int
	Channel    chan Message
}
