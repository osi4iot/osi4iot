package admin

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"pipelines/common"
	"pipelines/config"
	"pipelines/logger"
	"pipelines/utils"
	"strings"

	"sync"
	"time"
)

type Admin struct {
	baseUrl          string
	httpClient       *http.Client
	accessToken      string
	accessExpiry     time.Time
	refreshToken     string
	refreshExpiry    time.Time
	refreshThreshold time.Duration
	mutex            sync.RWMutex
	onTokenRefresh   func(LoginResponse)
	onAuthError      func(error)
	stopRefresh      chan struct{}
	refreshOnce      sync.Once

	userName string
	password string
	log      *logger.Logger
}

func CreateAdmin(cfg *config.Config, log *logger.Logger) (*Admin, error) {
	baseUrl := "http://admin_api:3200"
	if cfg.Mode == "local" {
		baseUrl = fmt.Sprintf("https://%s/admin_api", cfg.DomainName)
	}

	httpClient := &http.Client{
		Timeout: 20 * time.Second,
	}

	admin := &Admin{
		baseUrl:          baseUrl,
		userName:         cfg.AdminUsername,
		password:         cfg.AdminPassword,
		httpClient:       httpClient,
		refreshThreshold: time.Duration(cfg.RefreshThreshold) * time.Minute,
		log:              log,
	}

	err := admin.Login()
	if err != nil {
		return nil, fmt.Errorf("failed to login: %v", err)
	}

	admin.OnTokenRefresh(func(tokens LoginResponse) {
		duration := time.Until(admin.accessExpiry)
		log.Infof("Tokens refreshed successfully. New access token expires in %.2f seconds", duration.Seconds())
	})

	admin.OnAuthError(func(err error) {
		log.Errorf("Authentication error: %v", err)
	})

	log.Infof("Orgs flows admin created successfully")

	return admin, nil
}

func (a *Admin) GetOrgs(ctx context.Context, secretEncryptionKey string) []*common.Org {
	var orgs []*common.Org
	url := fmt.Sprintf("%s/organizations/full_info", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get orgs: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &orgs)
	if err != nil {
		a.log.Errorf("failed to unmarshal orgs: %v", err)
		return nil
	}

	for _, org := range orgs {
		if org.LlmEnabled && org.HashedLlmProviderApiKey != "" {
			hashedApiKey := org.HashedLlmProviderApiKey
			llmProviderApiKey, _ := utils.Decrypt(hashedApiKey, secretEncryptionKey)
			org.LlmProviderApiKey = llmProviderApiKey
		}
		if org.TelegramEnabled {
			if org.HashedTelegramBotToken != "" {
				hashedTelegramBotToken := org.HashedTelegramBotToken
				telegramBotToken, _ := utils.Decrypt(hashedTelegramBotToken, secretEncryptionKey)
				org.TelegramBotToken = telegramBotToken
			}
			if org.HashedTelegramWebhookSecretToken != "" {
				hashedTelegramWebhookSecretToken := org.HashedTelegramWebhookSecretToken
				telegramWebhookSecretToken, _ := utils.Decrypt(hashedTelegramWebhookSecretToken, secretEncryptionKey)
				org.TelegramWebhookSecretToken = telegramWebhookSecretToken
			}
		}
	}

	return orgs
}

func (a *Admin) GetOrg(ctx context.Context, orgId int, secretEncryptionKey string) *common.Org {
	url := fmt.Sprintf("%s/organization_full_info/id/%d", a.baseUrl, orgId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get org %d: %v", orgId, err)
		return nil
	}

	var org common.Org
	err = utils.UnmarshalData(response, &org)
	if err != nil {
		a.log.Errorf("failed to unmarshal org %d: %v", orgId, err)
		return nil
	}
	if org.LlmEnabled && org.LlmProviderUrl != "" {
		hashedApiKey := org.HashedLlmProviderApiKey
		llmProviderApiKey, err := utils.Decrypt(hashedApiKey, secretEncryptionKey)
		if err != nil {
			a.log.Errorf("failed to decrypt LLM provider API key for org %d: %v", orgId, err)
			return nil
		}
		org.LlmProviderApiKey = llmProviderApiKey
	}

	if org.TelegramEnabled && org.HashedTelegramBotToken != "" {
		hashedTelegramBotToken := org.HashedTelegramBotToken
		telegramBotToken, err := utils.Decrypt(hashedTelegramBotToken, secretEncryptionKey)
		if err != nil {
			a.log.Errorf("failed to decrypt Telegram bot token for org %d: %v", orgId, err)
			return nil
		}
		org.TelegramBotToken = telegramBotToken
	}

	if org.TelegramWebhookSecretToken != "" && org.HashedTelegramWebhookSecretToken != "" {
		hashedTelegramWebhookSecretToken := org.HashedTelegramWebhookSecretToken
		telegramWebhookSecretToken, err := utils.Decrypt(hashedTelegramWebhookSecretToken, secretEncryptionKey)
		if err != nil {
			a.log.Errorf("failed to decrypt Telegram webhook secret token for org %d: %v", orgId, err)
			return nil
		}
		org.TelegramWebhookSecretToken = telegramWebhookSecretToken
	}

	return &org
}

func (a *Admin) GetGroups(ctx context.Context) []*common.Group {
	var groups []*common.Group
	url := fmt.Sprintf("%s/groups/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get groups: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &groups)
	if err != nil {
		a.log.Errorf("failed to unmarshal groups: %v", err)
		return nil
	}

	return groups
}

func (a *Admin) GetGroup(ctx context.Context, groupId int) *common.Group {
	url := fmt.Sprintf("%s/group_user_managed/%d", a.baseUrl, groupId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get group %d: %v", groupId, err)
		return nil
	}

	var group common.Group
	err = utils.UnmarshalData(response, &group)
	if err != nil {
		a.log.Errorf("failed to unmarshal group %d: %v", groupId, err)
		return nil
	}

	return &group
}

func (a *Admin) GetNotificationChannels(ctx context.Context) []*common.NotificationChannel {
	var channels []*common.NotificationChannel
	url := fmt.Sprintf("%s/notification_channels", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get notification channels: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &channels)
	if err != nil {
		a.log.Errorf("failed to unmarshal notification channels: %v", err)
		return nil
	}

	return channels
}

func (a *Admin) GetNotificationChannel(ctx context.Context, channelId int) *common.NotificationChannel {
	url := fmt.Sprintf("%s/notification_channel/%d", a.baseUrl, channelId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get notification channel %d: %v", channelId, err)
		return nil
	}

	var channel common.NotificationChannel
	err = utils.UnmarshalData(response, &channel)
	if err != nil {
		a.log.Errorf("failed to unmarshal notification channel %d: %v", channelId, err)
		return nil
	}

	return &channel
}

func (a *Admin) GetAssets(ctx context.Context) []*common.Asset {
	var assets []*common.Asset
	url := fmt.Sprintf("%s/assets/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get assets: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &assets)
	if err != nil {
		a.log.Errorf("failed to unmarshal assets: %v", err)
		return nil
	}

	return assets
}

func (a *Admin) GetSensor(ctx context.Context, groupId int, sensorId int) *common.Sensor {
	url := fmt.Sprintf("%s/sensor/%d/id/%d", a.baseUrl, groupId, sensorId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get sensor %d: %v", sensorId, err)
		return nil
	}

	var sensor common.Sensor
	err = utils.UnmarshalData(response, &sensor)
	if err != nil {
		a.log.Errorf("failed to unmarshal sensor %d: %v", sensorId, err)
		return nil
	}

	return &sensor
}

func (a *Admin) GetSensors(ctx context.Context) []*common.Sensor {
	var sensors []*common.Sensor
	url := fmt.Sprintf("%s/sensors/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get sensors: %v", err)
		return nil
	}
	err = utils.UnmarshalData(response, &sensors)
	if err != nil {
		a.log.Errorf("failed to unmarshal sensors: %v", err)
		return nil
	}

	return sensors
}

func (a *Admin) GetTopics(ctx context.Context) []*common.Topic {
	var topics []*common.Topic
	url := fmt.Sprintf("%s/topics/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get topics: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &topics)
	if err != nil {
		a.log.Errorf("failed to unmarshal topics: %v", err)
		return nil
	}

	return topics
}

func (a *Admin) GetTopic(ctx context.Context, groupId int, topicId int) *common.Topic {
	url := fmt.Sprintf("%s/topic/%d/id/%d", a.baseUrl, groupId, topicId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get topic %d: %v", topicId, err)
		return nil
	}
	var topic common.Topic
	err = utils.UnmarshalData(response, &topic)
	if err != nil {
		a.log.Errorf("failed to unmarshal topic %d: %v", topicId, err)
		return nil
	}
	return &topic
}

func (a *Admin) GetMlModels(ctx context.Context) []*common.MLModel {
	var mlModels []*common.MLModel
	url := fmt.Sprintf("%s/ml_models/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get ML models: %v", err)
		return nil
	}
	err = utils.UnmarshalData(response, &mlModels)
	if err != nil {
		a.log.Errorf("failed to unmarshal ML models: %v", err)
		return nil
	}
	return mlModels
}

func (a *Admin) GetMlModel(ctx context.Context, groupId int, mlModelId int) *common.MLModel {
	url := fmt.Sprintf("%s/ml_model/%d/id/%d", a.baseUrl, groupId, mlModelId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get ML model %d: %v", mlModelId, err)
		return nil
	}
	var mlModel common.MLModel
	err = utils.UnmarshalData(response, &mlModel)
	if err != nil {
		a.log.Errorf("failed to unmarshal ML model %d: %v", mlModelId, err)
		return nil
	}
	return &mlModel
}

func (a *Admin) GetAsset(ctx context.Context, groupId int, assetId int) *common.Asset {
	url := fmt.Sprintf("%s/asset/%d/id/%d", a.baseUrl, groupId, assetId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get asset %d: %v", assetId, err)
		return nil
	}

	var asset common.Asset
	err = utils.UnmarshalData(response, &asset)
	if err != nil {
		a.log.Errorf("failed to unmarshal asset %d: %v", assetId, err)
		return nil
	}

	return &asset
}

func (a *Admin) GetAssetTopics(ctx context.Context) []*common.AssetTopic {
	var assetTopics []*common.AssetTopic
	url := fmt.Sprintf("%s/asset_topics/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get asset topics: %v", err)
		return nil
	}
	err = utils.UnmarshalData(response, &assetTopics)
	if err != nil {
		a.log.Errorf("failed to unmarshal asset topics: %v", err)
		return nil
	}
	return assetTopics
}

func (a *Admin) GetAssetTopicsByAssetId(ctx context.Context, groupId int, assetId int) []*common.AssetTopic {
	url := fmt.Sprintf("%s/asset_topic/%d/%d", a.baseUrl, groupId, assetId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get asset topic %d: %v", assetId, err)
		return nil
	}

	var assetTopics []*common.AssetTopic
	err = utils.UnmarshalData(response, &assetTopics)
	if err != nil {
		a.log.Errorf("failed to unmarshal asset topic %d: %v", assetId, err)
		return nil
	}

	return assetTopics
}

func (a *Admin) GetDigitalTwins(ctx context.Context) []*common.DigitalTwin {
	var digitalTwins []*common.DigitalTwin
	url := fmt.Sprintf("%s/digital_twins/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get digital twins: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &digitalTwins)
	if err != nil {
		a.log.Errorf("failed to unmarshal digital twins: %v", err)
		return nil
	}

	return digitalTwins
}

func (a *Admin) GetDigitalTwin(ctx context.Context, groupId int, digitalTwinId int) *common.DigitalTwin {
	url := fmt.Sprintf("%s/digital_twin/%d/id/%d", a.baseUrl, groupId, digitalTwinId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get digital twin %d: %v", digitalTwinId, err)
		return nil
	}

	var digitalTwin common.DigitalTwin
	err = utils.UnmarshalData(response, &digitalTwin)
	if err != nil {
		a.log.Errorf("failed to unmarshal digital twin %d: %v", digitalTwinId, err)
		return nil
	}

	return &digitalTwin
}

func (a *Admin) GetDigitalTwinTopics(ctx context.Context) []*common.DigitalTwinTopic {
	var digitalTwinTopics []*common.DigitalTwinTopic
	url := fmt.Sprintf("%s/digital_twin_topics/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get digital twin topics: %v", err)
		return nil
	}
	err = utils.UnmarshalData(response, &digitalTwinTopics)
	if err != nil {
		a.log.Errorf("failed to unmarshal digital twin topics: %v", err)
		return nil
	}
	return digitalTwinTopics
}

func (a *Admin) GetDigitalTwinTopicsByDTid(ctx context.Context, groupId int, digitalTwinId int) []*common.DigitalTwinTopic {
	url := fmt.Sprintf("%s/digital_twin_topic/%d/%d", a.baseUrl, groupId, digitalTwinId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get digital twin topic %d: %v", digitalTwinId, err)
		return nil
	}

	var digitalTwinTopics []*common.DigitalTwinTopic
	err = utils.UnmarshalData(response, &digitalTwinTopics)
	if err != nil {
		a.log.Errorf("failed to unmarshal digital twin topic %d: %v", digitalTwinId, err)
		return nil
	}

	return digitalTwinTopics
}

func (a *Admin) GetNodes(ctx context.Context) []*common.NodeData {
	var nodes []*common.NodeData
	url := fmt.Sprintf("%s/nodes/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get nodes: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &nodes)
	if err != nil {
		a.log.Errorf("failed to unmarshal nodes: %v", err)
		return nil
	}

	return nodes
}

func (a *Admin) GetNode(ctx context.Context, groupId int, nodeId int) *common.NodeData {
	url := fmt.Sprintf("%s/node/%d/id/%d", a.baseUrl, groupId, nodeId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get node %d: %v", nodeId, err)
		return nil
	}

	var node common.NodeData
	err = utils.UnmarshalData(response, &node)
	if err != nil {
		a.log.Errorf("failed to unmarshal node %d: %v", nodeId, err)
		return nil
	}

	return &node
}

func (a *Admin) GetWires(ctx context.Context) []*common.Wire {
	var wires []*common.Wire
	url := fmt.Sprintf("%s/wires/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get wires: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &wires)
	if err != nil {
		a.log.Errorf("failed to unmarshal wires: %v", err)
		return nil
	}

	return wires
}

func (a *Admin) GetWire(ctx context.Context, groupId int, wireId int) *common.Wire {
	url := fmt.Sprintf("%s/wire/%d/id/%d", a.baseUrl, groupId, wireId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get wire %d: %v", wireId, err)
		return nil
	}

	var wire common.Wire
	err = utils.UnmarshalData(response, &wire)
	if err != nil {
		a.log.Errorf("failed to unmarshal wire %d: %v", wireId, err)
		return nil
	}

	return &wire
}

func (a *Admin) GetS3DigitalTwinFolderInfo(ctx context.Context, groupId int, digitalTwinId int, folder string) []*common.S3FolderFileInfo {
	var folderInfo []*common.S3FolderFileInfo
	url := fmt.Sprintf("%s/digital_twin_file_list/%d/%d/%s", a.baseUrl, groupId, digitalTwinId, folder)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get s3 folder info: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &folderInfo)
	if err != nil {
		a.log.Errorf("failed to unmarshal fem results info: %v", err)
		return nil
	}

	return folderInfo
}

func (a *Admin) GetS3MlModelFolderInfo(ctx context.Context, groupId int, mlModelId int) []*common.S3FolderFileInfo {
	var folderInfo []*common.S3FolderFileInfo
	url := fmt.Sprintf("%s/ml_model_file_list/%d/%d", a.baseUrl, groupId, mlModelId)
	response, err := utils.HttpGetWithJwt(ctx, url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get s3 folder info: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &folderInfo)
	if err != nil {
		a.log.Errorf("failed to unmarshal fem results info: %v", err)
		return nil
	}

	return folderInfo
}

func (a *Admin) ProcessFemResultFile(ctx context.Context, femResultsPath string, groupId int, digitalTwinId int) {
	femResultsInfo := a.GetS3DigitalTwinFolderInfo(ctx, groupId, digitalTwinId, "femResFiles")

	if len(femResultsInfo) > 0 {
		isFemResultsProcessed, err := utils.IsFemResultsFileProcessed(femResultsPath, femResultsInfo[0])
		if err != nil {
			a.log.Errorf("failed to check if fem results file is processed: %v", err)
			return
		}

		if isFemResultsProcessed {
			return
		}

		fileName := strings.Split(femResultsInfo[0].FileName, "/")[4]
		lastModified := femResultsInfo[0].LastModified
		femResultFileUrl := fmt.Sprintf("%s/digital_twin_download_file/%d/%d/femResFiles/%s", a.baseUrl, groupId, digitalTwinId, fileName)
		response, err := utils.HttpGetWithJwt(ctx, femResultFileUrl, a.accessToken)
		if err != nil {
			a.log.Errorf("failed to download fem result file %s: %v", fileName, err)
			return
		}
		// Save the file or process it as needed
		jsonFilePath := filepath.Join(femResultsPath, fileName)
		err = utils.SaveToFile(jsonFilePath, response)
		if err != nil {
			a.log.Errorf("failed to save fem result file %s: %v", fileName, err)
		}

		processor := utils.NewFemResultsProcessor(femResultsPath, fileName, lastModified)
		err = processor.ProcessJSONFile(jsonFilePath)
		if err != nil {
			a.log.Errorf("Error processing JSON: %v\n", err)
			return
		}

		err = utils.DeleteFile(jsonFilePath)
		if err != nil {
			a.log.Errorf("Error deleting fem results json file %s: %v\n", jsonFilePath, err)
		}
	}
}

func (a *Admin) ProcessDocInfoFile(ctx context.Context, docInfoFilesPath string, groupId int, digitalTwinId int) {
	docInfoFilesInfo := a.GetS3DigitalTwinFolderInfo(ctx, groupId, digitalTwinId, "docInfoFiles")

	if len(docInfoFilesInfo) > 0 {
		fileName := strings.Split(docInfoFilesInfo[0].FileName, "/")[4]
		docInfoFilePath := filepath.Join(docInfoFilesPath, fileName)
		lastModified := docInfoFilesInfo[0].LastModified
		isNewer, _ := utils.IsDateNewerThanFile(lastModified, docInfoFilePath)
		if isNewer {
			docInfoFileUrl := fmt.Sprintf("%s/digital_twin_download_file/%d/%d/docInfoFiles/%s", a.baseUrl, groupId, digitalTwinId, fileName)
			response, err := utils.HttpGetWithJwt(ctx, docInfoFileUrl, a.accessToken)
			if err != nil {
				a.log.Errorf("failed to download doc info file %s: %v", fileName, err)
				return
			}
			err = utils.SaveToFile(docInfoFilePath, response)
			if err != nil {
				a.log.Errorf("failed to save doc info file %s: %v", fileName, err)
			}
		}
	}
}

func (a *Admin) DownloadMlModelFile(ctx context.Context, mlModelFolder string, groupId int, mlModelId int) string {
	mlModelFileInfo := a.GetS3MlModelFolderInfo(ctx, groupId, mlModelId)
	if len(mlModelFileInfo) > 0 {
		fileName := strings.Split(mlModelFileInfo[0].FileName, "/")[4]
		mlModelFilePath := filepath.Join(mlModelFolder, fileName)
		lastModified := mlModelFileInfo[0].LastModified
		isNewer, _ := utils.IsDateNewerThanFile(lastModified, mlModelFilePath)
		if isNewer {
			utils.DeleteFilesInFolder(mlModelFolder)
			mlModelFileUrl := fmt.Sprintf("%s/ml_model_download_file/%d/%d/%s", a.baseUrl, groupId, mlModelId, fileName)
			response, err := utils.HttpGetWithJwt(ctx, mlModelFileUrl, a.accessToken)
			if err != nil {
				a.log.Errorf("failed to download ML model file %s: %v", fileName, err)
				return ""
			}
			err = utils.SaveToFile(mlModelFilePath, response)
			if err != nil {
				a.log.Errorf("failed to save ML model file %s: %v", fileName, err)
			}
		}

		return fileName
	}
	return ""
}
