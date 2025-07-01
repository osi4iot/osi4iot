package admin

import (
	"fmt"
	"net/http"
	"org_flows/common"
	"org_flows/config"
	"org_flows/logger"
	"org_flows/utils"
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

func (a *Admin) GetOrgs() map[int]*common.Org {
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

	orgsMap := make(map[int]*common.Org)
	for _, org := range orgs {
		orgsMap[org.Id] = org
	}

	return orgsMap
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

func (a *Admin) GetGroups() map[int]*common.Group {
	var groups []common.Group
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

	groupsMap := make(map[int]*common.Group)
	for _, group := range groups {
		groupsMap[group.ID] = &group
	}
	return groupsMap
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

func (a *Admin) GetAssets() map[int]*common.Asset {
	var assets []common.Asset
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

	assetsMap := make(map[int]*common.Asset)
	for _, asset := range assets {
		assetsMap[asset.ID] = &asset
	}

	return assetsMap
}

func (a *Admin) GetAsset(groupId int,assetId int) *common.Asset {
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

func (a *Admin) GetDigitalTwins() map[int]*common.DigitalTwin {
	var digitalTwins []common.DigitalTwin
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

	digitalTwinMap := make(map[int]*common.DigitalTwin)
	for _, digitalTwin := range digitalTwins {
		digitalTwinMap[digitalTwin.ID] = &digitalTwin
	}
	return digitalTwinMap
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