package common

import (
	"org_flows/logger"
	"org_flows/utils"
)

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

type Group struct {
	ID                            int    `json:"id"`
	Name                          string `json:"name"`
	Acronym                       string `json:"acronym"`
	GroupUID                      string `json:"groupUid"`
	TelegramInvitationLink        string `json:"telegramInvitationLink"`
	TelegramChatID                string `json:"telegramChatID"`
	EmailNotificationChannelID    int    `json:"emailNotificationChannelID"`
	TelegramNotificationChannelID int    `json:"telegramNotificationChannelID"`
	IsOrgDefaultGroup             bool   `json:"isOrgDefaultGroup"`
	FloorNumber                   int    `json:"floorNumber"`
	FeatureIndex                  int    `json:"featureIndex"`
}

type Asset struct {
	ID             int     `json:"id"`
	GroupID        int     `json:"groupId"`
	AssetUID       string  `json:"assetUid"`
	Description    string  `json:"description"`
	AssetType      string  `json:"assetType"`
	AssetTypeID    int     `json:"assetTypeId"`
	IconRadio      float64 `json:"iconRadio"`
	IconSizeFactor float64 `json:"iconSizeFactor"`
	Longitude      float64 `json:"longitude"`
	Latitude       float64 `json:"latitude"`
	IconSvgString  string  `json:"iconSvgString"`
	Created        string  `json:"created"`
	Updated        string  `json:"updated"`
}

type DigitalTwin struct {
	ID                          int      `json:"id"`
	GroupID                     int      `json:"groupId"`
	AssetID                     int      `json:"assetId"`
	OrgID                       int      `json:"orgId"`
	Scope                       string   `json:"scope"`
	DigitalTwinUID              string   `json:"digitalTwinUid"`
	Description                 string   `json:"description"`
	Type                        string   `json:"type"`
	DashboardID                 int      `json:"dashboardId"`
	MaxNumResFemFiles           int      `json:"maxNumResFemFiles"`
	ChatAssistantEnabled        bool     `json:"chatAssistantEnabled"`
	ChatAssistantLanguage       string   `json:"chatAssistantLanguage"`
	DigitalTwinSimulationFormat string   `json:"digitalTwinSimulationFormat"`
	DashboardURL                string   `json:"dashboardUrl"`
	SensorsRef                  []string `json:"sensorsRef"`
	Created                     string   `json:"created"`
	Updated                     string   `json:"updated"`
}