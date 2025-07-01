package common

import (
	"org_flows/logger"
	"org_flows/utils"
)

type AdminMessage struct {
	Component string `json:"component"` // org, group, asset, digitalTwin, flow, node
	Action    string `json:"action"`    // create, update, delete
	Id        int    `json:"id"`        // ID of the org, group, asset, digitalTwin, flow, or node
}

type Message struct {
	Timestamp utils.Timestamp `json:"timestamp"`
	Subject   string          `json:"subject"`
	Payload   any             `json:"payload"`
	State     map[string]any  `json:"state"`
}

type Node interface {
	Start(log *logger.Logger)
	Stop(log *logger.Logger)
	GiveUid() string
}

type Org struct {
	Id         int              `json:"id"`
	OrgHash    string           `json:"orgHash"`
	Name       string           `json:"name"`
	Acronym    string           `json:"acronym"`
	Role       string           `json:"role"`
	City       string           `json:"city"`
	BuildingId int              `json:"buildingId"`
	Flows      map[string]*Flow `json:"flows"`
}

type Group struct {
	ID                            int    `json:"id"`
	OrgID                         int    `json:"orgId"`
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
	ID          int     `json:"id"`
	OrgID       int     `json:"orgId"`
	GroupID     int     `json:"groupId"`
	AssetUID    string  `json:"assetUid"`
	Description string  `json:"description"`
	AssetType   string  `json:"assetType"`
	AssetTypeID int     `json:"assetTypeId"`
	Longitude   float64 `json:"longitude"`
	Latitude    float64 `json:"latitude"`
	Created     string  `json:"created"`
	Updated     string  `json:"updated"`
}

type DigitalTwin struct {
	ID                          int            `json:"id"`
	GroupID                     int            `json:"groupId"`
	AssetID                     int            `json:"assetId"`
	OrgID                       int            `json:"orgId"`
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
}
