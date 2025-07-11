package admin

import (
	"fmt"
	"net/http"
	"pipelines/common"
	"pipelines/config"
	"pipelines/logger"
	"pipelines/utils"

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
	baseUrl := "admin_api:3200"
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

func (a *Admin) GetOrgs() []*common.Org {
	var orgs []*common.Org
	url := fmt.Sprintf("%s/organizations/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
	if err != nil {
		a.log.Errorf("failed to get orgs: %v", err)
		return nil
	}

	err = utils.UnmarshalData(response, &orgs)
	if err != nil {
		a.log.Errorf("failed to unmarshal orgs: %v", err)
		return nil
	}

	return orgs
}

func (a *Admin) GetOrg(orgId int) *common.Org {
	url := fmt.Sprintf("%s/organization/id/%d", a.baseUrl, orgId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

	return &org
}

func (a *Admin) GetGroups() []*common.Group {
	var groups []*common.Group
	url := fmt.Sprintf("%s/groups/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetGroup(groupId int) *common.Group {
	url := fmt.Sprintf("%s/group/id/%d", a.baseUrl, groupId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetAssets() []*common.Asset {
	var assets []*common.Asset
	url := fmt.Sprintf("%s/assets/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetSensor (groupId int, sensorId int) *common.Sensor {
	url := fmt.Sprintf("%s/sensor/%d/id/%d", a.baseUrl, groupId, sensorId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetSensors() []*common.Sensor {
	var sensors []*common.Sensor
	url := fmt.Sprintf("%s/sensors/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetTopics() []*common.Topic {
	var topics []*common.Topic
	url := fmt.Sprintf("%s/topics/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetTopic(groupId int, topicId int) *common.Topic {
	url := fmt.Sprintf("%s/topic/%d/id/%d", a.baseUrl, groupId, topicId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetMlModels() []*common.MLModel {
	var mlModels []*common.MLModel
	url := fmt.Sprintf("%s/ml_models/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetMlModel(groupId int, mlModelId int) *common.MLModel {
	url := fmt.Sprintf("%s/ml_model/%d/id/%d", a.baseUrl, groupId, mlModelId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetAsset(groupId int, assetId int) *common.Asset {
	url := fmt.Sprintf("%s/asset/%d/id/%d", a.baseUrl, groupId, assetId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetAssetTopics() []*common.AssetTopic {
	var assetTopics []*common.AssetTopic
	url := fmt.Sprintf("%s/asset_topics/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetAssetTopicsByAssetId(groupId int, assetId int) []*common.AssetTopic {
	url := fmt.Sprintf("%s/asset_topic/%d/%d", a.baseUrl, groupId, assetId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetDigitalTwins() []*common.DigitalTwin {
	var digitalTwins []*common.DigitalTwin
	url := fmt.Sprintf("%s/digital_twins/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetDigitalTwin(groupId int, digitalTwinId int) *common.DigitalTwin {
	url := fmt.Sprintf("%s/digital_twin/%d/id/%d", a.baseUrl, groupId, digitalTwinId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetDigitalTwinTopics() []*common.DigitalTwinTopic {
	var digitalTwinTopics []*common.DigitalTwinTopic
	url := fmt.Sprintf("%s/digital_twin_topics/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetDigitalTwinTopicsByDTid(groupId int, digitalTwinId int) []*common.DigitalTwinTopic {
	url := fmt.Sprintf("%s/digital_twin_topic/%d/%d", a.baseUrl, groupId, digitalTwinId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetNodes() []*common.NodeData {
	var nodes []*common.NodeData
	url := fmt.Sprintf("%s/nodes/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetNode(groupId int, nodeId int) *common.NodeData {
	url := fmt.Sprintf("%s/node/%d/id/%d", a.baseUrl, groupId, nodeId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetWires() []*common.Wire {
	var wires []*common.Wire
	url := fmt.Sprintf("%s/wires/user_managed", a.baseUrl)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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

func (a *Admin) GetWire(groupId int, wireId int) *common.Wire {
	url := fmt.Sprintf("%s/wire/%d/id/%d", a.baseUrl, groupId, wireId)
	response, err := utils.HttpGetWithJwt(url, a.accessToken)
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
