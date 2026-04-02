package common

import (
	"context"
	"database/sql"
	"encoding/json"
	"pipelines/logger"
	nats_pkg "pipelines/nats"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type Manager interface {
	GetAssets() []*Asset
	GetAssetById(assetId int) *Asset
	GetAssetByUid(assetUid string) *Asset
	GetAssetsByGroupId(groupId int) []*Asset
	GetAssetByShortUidAndGroupId(shortUid string, groupId int) *Asset
	AddAsset(ctx context.Context, asset *Asset)
	AddAssets(ctx context.Context, assets []*Asset)
	DeleteAsset(assetId int) error

	AddAssetTopicRef(assetId int, topicId int, topicRef string)
	DeleteAssetTopic(assetId int, topicRef string) error
	DeleteAssetTopicRef(assetId int, topicRef string) error
	AddAssetTopicsRef(assetTopics []*AssetTopic)
	GetTopicByAssetId(assetId int, topicRef string) *Topic
	GetTopicsByAssetId(assetId int) map[string]*Topic

	GetAssetS3Folder(assetId int, folderName string) *AssetS3Folder
	GetAssetS3FolderByAssetId(assetId int) []*AssetS3Folder
	UpdateAssetS3FolderStatsById(ctx context.Context, groupId int, assetId int, folderName string, stats S3FolderStats) error

	GetDigitalTwins() []*DigitalTwin
	GetDigitalTwin(digitalTwinId int) *DigitalTwin
	AddDigitalTwin(ctx context.Context, digitalTwin *DigitalTwin, createPipeline bool)
	AddDigitalTwins(ctx context.Context, digitalTwins []*DigitalTwin)
	DeleteDigitalTwin(ctx context.Context, digitalTwinId int) error
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
	AddMlModels(ctx context.Context, models []*MLModel)
	DeleteMlModel(modelId int) error
	UpdateMlModel(model *MLModel) error
	GetS3MlModelFolderInfo(ctx context.Context, groupId int, mlModelId int) []*S3FolderFileInfo
	GetMlModelFolder(orgId int, groupId int, mlModelId int) string
	GetMlModelFilePath(orgId int, groupId int, mlModelId int) string
	DownloadMlModelFile(ctx context.Context, mlModelFilePath string, groupId int, mlModelId int) string
	GetMlModelFile(ctx context.Context, groupId int, mlModelId int) error
	DeleteOldMlModelFiles(currentModels []*MLModel) error
	GetModelFolders(rootPath string) ([]MlModelFolder, error)

	StartNodes(ctx context.Context)
	StopPipelines(ctx context.Context)

	CreatePipelineInDigitalTwin(ctx context.Context, digitalTwinId int)
	UpdatePipelineInDigitalTwin(ctx context.Context, digitalTwinId int)
	StartNodesInDigitalTwin(ctx context.Context, digitalTwinId int, needReinitialization bool)
	RestartNodesInDigitalTwin(ctx context.Context, digitalTwinId int, needReinitialization bool)
	StopNodesInDigitalTwin(ctx context.Context, digitalTwinId int, action string)
	StopPipelineStatusPublisher(digitalTwinId int)
	DeletePipelineInDigitalTwin(ctx context.Context, digitalTwinId int)

	GetOrgs() []*Org
	GetOrg(orgId int) *Org
	AddOrg(ctx context.Context, org *Org)
	AddOrgs(ctx context.Context, orgs []*Org)
	DeleteOrg(ctx context.Context, orgId int) error
	UpdateOrg(ctx context.Context, org *Org) error

	GetGroups() []*Group
	GetGroup(groupId int) *Group
	AddGroup(ctx context.Context,group *Group)
	AddGroups(ctx context.Context, groups []*Group)
	DeleteGroup(ctx context.Context, groupId int) error
	UpdateGroup(group *Group) error
	GetGroupKvStore(groupId int) *nats_pkg.KVStore
	GetAssetStateKvStoreKey(orgHash string, groupUid string, assetUid string) string

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

	GetReplicaIndex() int

	GetEncryptionSecretKey() string
	GetOrgLlmEnabled(orgId int) bool
	GetOrgLlmProviderApiKey(orgId int) string
	GetOrgLlmProviderUrl(orgId int) string
	GetGroupLlmEnabled(groupId int) bool
	GetDefaultLlmModel() string
	GetDefaultLlmTemperature() float32
	GetDefaultLlmTopK() int32
	GetDefaultLlmTopP() float32
	GetLlmMaxTokens() int
	GetMcpServersPath() string
	GetPipelinesDataPath() string
	GetMaxChatMessagesPerUser() int

	GetS3DigitalTwinFolderInfo(ctx context.Context, groupId int, digitalTwinId int, folder string) []*S3FolderFileInfo
	GetFemResultsPath(orgId int, groupId int, digitalTwinId int) string
	GetDigitalTwinFolder(orgId int, groupId int, digitalTwinId int) string
	AddFemResultsInDigitalTwins(ctx context.Context) error
	AddFemResultsInDigitalTwin(ctx context.Context, digitalTwinId int) error
	DeleteFemResultsInDigitalTwin(digitalTwinId int) error

	GetDocInfoFilesPath(orgId int, groupId int, digitalTwinId int) string
	AddDocInfoFilesInDigitalTwins(ctx context.Context) error
	AddDocInfoFileInDigitalTwin(ctx context.Context, digitalTwinId int) error
	DeleteDocInfoFileInDigitalTwin(digitalTwinId int) error

	GetLeaderKvStore() jetstream.KeyValue
	SetPipelineStatusSubscription(ctx context.Context, digitalTwin *DigitalTwin) *nats.Subscription

	GetDbPool() *pgxpool.Pool
	GetDuckdbPool() *sql.DB
	GetS3Client() *s3.Client
	GetS3BucketName() string

	SendToIotDataChannel(data ThingData)
}

func SchemasAreEqual(a, b map[string]any) bool {
	if len(a) != len(b) {
		return false
	}
	aBytes, err := json.Marshal(a)
	if err != nil {
		return false
	}
	bBytes, err := json.Marshal(b)
	if err != nil {
		return false
	}
	return string(aBytes) == string(bBytes)
}
