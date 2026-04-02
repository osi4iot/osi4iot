package common

import (
	"context"
	"image"
	"time"

	"github.com/nats-io/nats.go"

	"pipelines/leader_election"
	nats_pkg "pipelines/nats"
	"pipelines/telegram"
)

type AdminMessage struct {
	Component string         `json:"component"` // org, group, asset, digitalTwin, flow, node
	Action    string         `json:"action"`    // create, update, delete
	Id        int            `json:"id"`        // ID of the org, group, asset, digitalTwin, flow, or node
	Context   map[string]any `json:"context"`   // Contextual information (e.g., groupId, orgId, assetId, digitalTwinId)
}

type Message struct {
	Topic   string         `json:"topic"`
	Payload map[string]any `json:"payload"`
	State   map[string]any `json:"state"`
	Image   image.Image    `json:"image"`
}

type Org struct {
	Id                               int                            `json:"id"`
	OrgHash                          string                         `json:"orgHash"`
	Name                             string                         `json:"name"`
	Acronym                          string                         `json:"acronym"`
	Role                             string                         `json:"role"`
	City                             string                         `json:"city"`
	BuildingId                       int                            `json:"buildingId"`
	LlmEnabled                       bool                           `json:"llmEnabled"`
	LlmProviderUrl                   string                         `json:"llmProviderUrl"`
	HashedLlmProviderApiKey          string                         `json:"hashedLlmProviderApiKey"`
	LlmProviderApiKey                string                         `json:"llmProviderApiKey"`
	TelegramEnabled                  bool                           `json:"telegramEnabled"`
	HashedTelegramBotToken           string                         `json:"hashedTelegramBotToken"`
	TelegramBotToken                 string                         `json:"telegramBotToken"`
	HashedTelegramWebhookSecretToken string                         `json:"hashedTelegramWebhookSecretToken"`
	TelegramWebhookSecretToken       string                         `json:"telegramWebhookSecretToken"`
	LeaderElector                    *leader_election.LeaderElector `json:"-"`
	TelegramListener                 *telegram.OrgListener          `json:"-"`
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
	LlmEnabled                    bool   `json:"llmEnabled"`

	KvStore *nats_pkg.KVStore `json:"-"`
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
	Id                int            `json:"id"`
	OrgId             int            `json:"orgId"`
	GroupId           int            `json:"groupId"`
	GroupUid          string         `json:"groupUid"`
	TopicType         string         `json:"topicType"`
	TopicName         string         `json:"topicName"`
	Description       string         `json:"description"`
	TopicUid          string         `json:"topicUid"`
	MqttAccessControl string         `json:"mqttAccessControl"`
	PayloadJsonSchema map[string]any `json:"payloadJsonSchema"`
	RequireS3Storage  bool           `json:"requireS3Storage"`
	S3Folder          string         `json:"s3Folder"`
	LastS3Storage     string         `json:"lastS3Storage"`
	ParquetSchema     map[string]any `json:"parquetSchema"`
	Created           string         `json:"created"`
	Updated           string         `json:"updated"`
}

type AssetTopic struct {
	AssetId  int    `json:"assetId"`
	TopicId  int    `json:"topicId"`
	TopicRef string `json:"topicRef"`
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
	DigitalTwinUid              string         `json:"digitalTwinUid"`
	Description                 string         `json:"description"`
	Type                        string         `json:"type"`
	DashboardID                 int            `json:"dashboardId"`
	MaxNumResFemFiles           int            `json:"maxNumResFemFiles"`
	ChatAssistantEnabled        bool           `json:"chatAssistantEnabled"`
	ChatAssistantLanguage       string         `json:"chatAssistantLanguage"`
	DigitalTwinSimulationFormat map[string]any `json:"digitalTwinSimulationFormat"`
	DashboardURL                string         `json:"dashboardUrl"`
	SensorsRef                  []string       `json:"sensorsRef"`
	PipelineFileName            string         `json:"pipelineFileName"`
	PipelineFileLastModifDate   string         `json:"pipelineFileLastModifDate"`
	PipelineFileData            string         `json:"pipelineFileData"`
	Created                     string         `json:"created"`
	Updated                     string         `json:"updated"`

	KvStore                    *nats_pkg.KVStore
	Pipeline                   Pipeline
	PipelineStatusSubscription *nats.Subscription
}

type DigitalTwinTopic struct {
	DigitalTwinId int    `json:"digitalTwinId"`
	TopicId       int    `json:"topicId"`
	TopicRef      string `json:"topicRef"`
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
	FileName    string `json:"fileName"`
	Created     string `json:"created"`
	Updated     string `json:"updated"`
}

type MlModelFolder struct {
	Path      string
	GroupId   int
	OrgId     int
	MlModelId int
}

type NotificationChannel struct {
	Id                int            `json:"id"`
	OrgId             int            `json:"orgId"`
	Name              string         `json:"name"`
	Type              string         `json:"type"`
	Settings          string         `json:"settings"`
	SecureSettings    string         `json:"secureSettings"`
	Created           string         `json:"created"`
	Updated           string         `json:"updated"`
	IsDefault         bool           `json:"isDefault"`
	Frequency         int            `json:"frequency"`
	SendReminder      bool           `json:"sendReminder"`
	DisableResolveMsg bool           `json:"disableResolveMessage"`
	Uid               string         `json:"uid"`
	ChannelType       string         `json:"channelType"`
	ChannelSettings   map[string]any `json:"channelSettings"`
}

type ParquetSchemaHistory struct {
	S3FolderRowID int       `json:"s3FolderRowId"`
	Schema        string    `json:"parquetSchema"`
	ValidFrom     time.Time `json:"validFrom"`
	ValidTo       time.Time `json:"validTo"`
	Version       int       `json:"version"`
	IsCurrent     bool      `json:"isCurrent"`
}

type AssetS3Folder struct {
	Id                int                    `json:"id"`
	OrgId             int                    `json:"orgId"`
	GroupId           int                    `json:"groupId"`
	GroupUid          string                 `json:"groupUid"`
	AssetId           int                    `json:"assetId"`
	AssetUid          string                 `json:"assetUid"`
	FolderName        string                 `json:"folderName"`
	ParquetSchema     map[string]any         `json:"parquetSchema"`
	LastS3Storage     string                 `json:"lastS3Storage"`
	ParquetFileCount  int                    `json:"parquetFileCount"`
	ParquetTotalBytes int64                  `json:"parquetTotalBytes"`
	Version           int                    `json:"version"`
	IsCurrent         bool                   `json:"isCurrent"`
	ValidFrom         string                 `json:"validFrom"`
	ValidTo           string                 `json:"validTo"`
	SchemaHistory     []ParquetSchemaHistory `json:"schemaHistory,omitempty"`
	Created           string                 `json:"created,omitempty"`
	Updated           string                 `json:"updated,omitempty"`
}

type ParquetField struct {
	Tag string `json:"Tag"`
}

type ParquetSchema struct {
	Tag    string         `json:"Tag"`
	Fields []ParquetField `json:"Fields"`
}

type ParquetFieldDef struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Unit        string `json:"unit,omitempty"`
	Description string `json:"description,omitempty"`
}

type SchemaDef struct {
	Fields []ParquetFieldDef `json:"fields"`
}

// class UpdateS3FolderParquetStatsDto {
// 	@IsNumber()
// 	public parquetFileCount: number;

// 	@IsNumber()
// 	public parquetTotalBytes: number;

// 	@IsString()
// 	public lastS3Storage: string;
// }


type S3FolderStats struct {
	ParquetFileCount     int       `json:"parquetFileCount"`
	ParquetTotalBytes    int64     `json:"parquetTotalBytes"`
	LastS3Storage time.Time `json:"lastS3Storage"` // timestamp of the most recent file
}


type NodeData struct {
	NodeUid    string         `json:"nodeUid"`
	Name       string         `json:"name"`
	Type       string         `json:"type"`
	Xpos       float64        `json:"x"`
	Ypos       float64        `json:"y"`
	Settings   map[string]any `json:"settings"`
	NumOutputs int            `json:"numOutputs"`
	Debug      string         `json:"debug"`
}

type Wire struct {
	WireUid         string `json:"wireUid"`
	Name            string `json:"name"`
	NodeIniUid      string `json:"nodeIniUid"`
	NodeEndUid      string `json:"nodeEndUid"`
	NiniOutputIndex int    `json:"niniOutputIndex"`

	Ctx        context.Context
	Cancel     context.CancelFunc
	BufferSize int
	Channel    chan Message
}

type WireData struct {
	NodeEndUid string `json:"nodeEndUid"`
}

type PipelineNode struct {
	NodeUid    string       `json:"nodeUid"`
	Name       string       `json:"name"`
	Type       string       `json:"type"`
	X          float64      `json:"x"`
	Y          float64      `json:"y"`
	NumOutputs int          `json:"numOutputs"`
	Settings   string       `json:"settings"`
	Debug      string       `json:"debug"`
	Wires      [][]WireData `json:"wires"`
}

type PipelineData struct {
	OrgId                  int    `json:"org_id"`
	OrgHash                string `json:"org_hash"`
	GroupId                int    `json:"group_id"`
	AssetId                int    `json:"asset_id"`
	DigitalTwinId          int    `json:"digital_twin_id"`
	DigitalTwinUid         string `json:"digital_twin_uid"`
	DigitalTwinDescription string `json:"digital_twin_description"`
	FileData               string `json:"file_data"`
	FileName               string `json:"file_name"`
	FileLastModifDate      string `json:"file_last_modif_date"`
}

type PipelineLog struct {
	Level       string         `json:"level"`     // debug, error, info
	Component   string         `json:"component"` // node, pipeline, digitalTwin
	Name        string         `json:"name"`
	Uid         string         `json:"uid"`
	Message     string         `json:"message"`
	Description string         `json:"description"`
	OutputIndex int            `json:"outputIndex"`
	Payload     map[string]any `json:"payload"`
	State       map[string]any `json:"state"`
}

type S3FolderFileInfo struct {
	FileName     string `json:"fileName"`
	LastModified string `json:"lastModified"`
	Size         int64  `json:"size"`
}
