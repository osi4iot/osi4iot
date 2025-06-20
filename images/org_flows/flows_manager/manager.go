package flows_manager

import (
	"org_flows/config"
	"org_flows/logger"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

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

type Flow struct {
	FlowUID       string
	GroupID       int
	AssetID       int
	DigitalTwinID int
	Nodes         map[string]*Node
	Children      map[string][]string
	Channels      map[string]chan Message
	FM            FlowsManager
}

type FlowsManager struct {
	OrgId        int
	OrgHash      string
	NumReplicas  int
	ReplicaIndex int
	Groups       []Group
	Assets       []Asset
	DigitalTwins []DigitalTwin
	FlowMap      map[string]Flow
	Nats         *nats.Conn
	JetStream    jetstream.JetStream
}

func CreateFlowsManager(config *config.Config, natsConn *nats.Conn, jetStream jetstream.JetStream, log *logger.Logger) *FlowsManager {
	flowManager := FlowsManager{
		OrgId:        config.OrgId,
		OrgHash:      config.OrgHash,
		NumReplicas:  config.NumReplicas,
		ReplicaIndex: config.ReplicaIndex,
		Groups:       []Group{},
		Assets:       []Asset{},
		DigitalTwins: []DigitalTwin{},
		FlowMap:      make(map[string]Flow),
		Nats:         natsConn,
		JetStream:    jetStream,
	}

	for _, flow := range config.Flows {
		flow := CreateFlow(flow, flowManager, log)
		flow.Start(log)
		flowManager.FlowMap[flow.FlowUID] = flow
	}

	return &flowManager
}

func CreateFlow(configFlow config.Flow, fm FlowsManager, log *logger.Logger) Flow {
	flow := Flow{
		FlowUID:       configFlow.FlowUID,
		GroupID:       configFlow.GroupID,
		AssetID:       configFlow.AssetID,
		DigitalTwinID: configFlow.DigitalTwinID,
		Nodes:         make(map[string]*Node),
		Children:      make(map[string][]string),
		Channels:      make(map[string]chan Message),
		FM:            fm,
	}

	for _, nodeConfig := range configFlow.Nodes {
		node := CreateNode(nodeConfig, &flow, log)
		nodeUid := node.GiveUid()
		flow.Nodes[nodeUid] = &node
		if nodeConfig.Children != nil {
			flow.Children[nodeUid] = nodeConfig.Children
			for _, childUid := range nodeConfig.Children {
				newChannel := make(chan Message)
				flow.Channels[childUid] = newChannel
			}
		} else {
			flow.Children[nodeUid] = []string{}
			flow.Channels[nodeUid] = nil
		}
	}

	return flow
}

func (flow *Flow) Start(log *logger.Logger) {
	log.Infof("Starting flow with UID: %s", flow.FlowUID)
	for _, node := range flow.Nodes {
		(*node).Start(log)
	}
}
