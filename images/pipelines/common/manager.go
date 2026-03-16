package common

import (
	"pipelines/logger"
	nats_pkg "pipelines/nats"

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
	AddAsset(asset *Asset)
	AddAssets(assets []*Asset)
	DeleteAsset(assetId int) error

	AddAssetTopicRef(assetId int, topicId int, topicRef string)
	DeleteAssetTopic(assetId int, topicRef string) error
	DeleteAssetTopicRef(assetId int, topicRef string) error
	AddAssetTopicsRef(assetTopics []*AssetTopic)
	GetTopicByAssetId(assetId int, topicRef string) *Topic
	GetTopicsByAssetId(assetId int) map[string]*Topic

	GetDigitalTwins() []*DigitalTwin
	GetDigitalTwin(digitalTwinId int) *DigitalTwin
	AddDigitalTwin(digitalTwin *DigitalTwin, createPipeline bool)
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
	GetS3MlModelFolderInfo(groupId int, mlModelId int) []*S3FolderFileInfo
	GetMlModelFolder(orgId int, groupId int, mlModelId int) string
	GetMlModelFilePath(orgId int, groupId int, mlModelId int) string
	DownloadMlModelFile(mlModelFilePath string, groupId int, mlModelId int) string
	GetMlModelFile(groupId int, mlModelId int) error
	DeleteOldMlModelFiles(currentModels []*MLModel) error
	GetModelFolders(rootPath string) ([]MlModelFolder, error)

	StartNodes()
	StopPipelines()

	CreatePipelineInDigitalTwin(digitalTwinId int)
	UpdatePipelineInDigitalTwin(digitalTwinId int)
	StartNodesInDigitalTwin(digitalTwinId int, needReinitialization bool)
	RestartNodesInDigitalTwin(digitalTwinId int, needReinitialization bool)
	StopNodesInDigitalTwin(digitalTwinId int, action string)
	StopPipelineStatusPublisher(digitalTwinId int)
	DeletePipelineInDigitalTwin(digitalTwinId int)

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

	GetS3DigitalTwinFolderInfo(groupId int, digitalTwinId int, folder string) []*S3FolderFileInfo
	GetFemResultsPath(orgId int, groupId int, digitalTwinId int) string
	GetDigitalTwinFolder(orgId int, groupId int, digitalTwinId int) string
	AddFemResultsInDigitalTwins() error
	AddFemResultsInDigitalTwin(digitalTwinId int) error
	DeleteFemResultsInDigitalTwin(digitalTwinId int) error

	GetDocInfoFilesPath(orgId int, groupId int, digitalTwinId int) string
	AddDocInfoFilesInDigitalTwins() error
	AddDocInfoFileInDigitalTwin(digitalTwinId int) error
	DeleteDocInfoFileInDigitalTwin(digitalTwinId int) error

	GetLeaderKvStore() jetstream.KeyValue
	SetPipelineStatusSubscription(digitalTwin *DigitalTwin) *nats.Subscription

	GetDbPool() *pgxpool.Pool

	SendToIotDataChannel(data ThingData)
	
}
