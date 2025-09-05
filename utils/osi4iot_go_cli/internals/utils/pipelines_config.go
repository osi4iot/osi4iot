package utils

import (
	"bytes"
	"text/template"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

// Dev2pdbConfig generates a configuration string for the dev2pdb service.
// It uses a template to fill in the parameters for the configuration file.
var pipelinesConfigTmpl = `
mode: "{{ .Mode }}"  # options: "dev", "prod"
domainName: "{{ .DomainName }}"
adminUserName: "{{ .AdminUserName }}"
adminPassword: "{{ .AdminPassword }}"
numReplicas: {{ .NumReplicas }}
replicaIndex: {{ .ReplicaIndex }}
numStreamReplicas: {{ .NumStreamReplicas }}
isRaftLeader: {{ .IsRaftLeader }}
functionsTimeout: {{ .FunctionsTimeout }}
platformTelegramBotToken: "{{ .PlatformTelegramBotToken }}"
platformEmailPassword: "{{ .PlatformEmailPassword }}"
platformEmailUsername: "{{ .PlatformEmailUsername }}"
refreshThreshold: {{ .RefreshThreshold }}
shardCount: {{ .ShardCount }}
llmProviderApiKey: "{{ .LlmProviderApiKey }}"
llmProviderUrl: "{{ .LlmProviderUrl }}"
defaultLlmModel: "{{ .DefaultLlmModel }}"
defaultLlmTemperature: {{ .DefaultLlmTemperature }}
llmMaxTokens: {{ .LlmMaxTokens }}
mcpServersPath: "{{ .McpServersPath }}"
maxChatMessagesPerUser: {{ .MaxChatMessagesPerUser }}
pipelinesDataPath: "{{ .PipelinesDataPath }}"

nats:
  serversUrl:
{{- range .NATS.ServersURL }}
    - "{{ . }}"
{{- end }}
  username: "{{ .NATS.Username }}"
  password: "{{ .NATS.Password }}"
  timeout: {{ .NATS.Timeout }}

timescaledb:
  user: "{{ .TimescaleDB.User }}"
  password: "{{ .TimescaleDB.Password }}"
  host: "{{ .TimescaleDB.Host }}"
  port: {{ .TimescaleDB.Port }}
  dbName: "{{ .TimescaleDB.DBName }}"
  sslmode: "{{ .TimescaleDB.SSLMode }}"
`

type PostresqlParams struct {
	User     string
	Password string
	Host     string
	Port     int
	DBName   string
	SSLMode  string
}

type PipelinesParams struct {
	Mode                     string
	DomainName               string
	AdminUserName            string
	AdminPassword            string
	NumReplicas              int
	ReplicaIndex             int
	NumStreamReplicas        int
	ShardIndex               int
	IsRaftLeader             bool
	FunctionsTimeout         int
	TelegramBotToken         string
	PlatformEmailUsername    string
	PlatformEmailPassword    string
	PlatformTelegramBotToken string
	RefreshThreshold         uint
	ShardCount               int
	LlmProviderApiKey        string
	LlmProviderUrl           string
	DefaultLlmModel          string
	DefaultLlmTemperature    float32
	LlmMaxTokens             int
	McpServersPath           string
	MaxChatMessagesPerUser   int
	PipelinesDataPath        string
	NATS                     NATSParams
	TimescaleDB              TimescaleDBParams
}

// PipelinesConfig generates a configuration string for the pipelines service.
func PipelinesConfig(platformData *types.PlatformData, nodeRoleNumMap map[string]int) (string, error) {
	serversUrl := []string{"nats://nats1:4222"}
	if nodeRoleNumMap["Platform worker"] >= 3 {
		serversUrl = append(serversUrl, "nats://nats2:4222")
		serversUrl = append(serversUrl, "nats://nats3:4222")
	}

	params := PipelinesParams{
		Mode:                   "prod",
		DomainName:             platformData.PlatformInfo.DomainName,
		AdminUserName:          platformData.PlatformInfo.PlatformAdminUserName,
		AdminPassword:          platformData.PlatformInfo.PlatformAdminPassword,
		NumReplicas:            1,
		ReplicaIndex:           1,
		NumStreamReplicas:      1,
		IsRaftLeader:           true,
		FunctionsTimeout:       5000,
		TelegramBotToken:       platformData.PlatformInfo.TelegramBotToken,
		PlatformEmailUsername:  platformData.PlatformInfo.NotificationsEmailUser,
		PlatformEmailPassword:  platformData.PlatformInfo.NotificationsEmailPassword,
		RefreshThreshold:       10,
		ShardCount:             8,
		LlmProviderApiKey:      platformData.PlatformInfo.LlmProviderApiKey,
		LlmProviderUrl:         platformData.PlatformInfo.LlmProviderUrl,
		DefaultLlmModel:        "openai:gpt-oss-120b",
		DefaultLlmTemperature:  0.7,
		LlmMaxTokens:           1000,
		McpServersPath:         "",
		MaxChatMessagesPerUser: 500,
		PipelinesDataPath:      "/pipelines/data/",

		NATS: NATSParams{
			ServersURL: serversUrl,
			Username:   platformData.PlatformInfo.PlatformAdminUserName,
			Password:   platformData.PlatformInfo.PlatformAdminPassword,
			Timeout:    "15s",
		},
		TimescaleDB: TimescaleDBParams{
			User:     platformData.PlatformInfo.TimescaleUser,
			Password: platformData.PlatformInfo.TimescalePassword,
			Host:     "timescaledb",
			Port:     5432,
			DBName:   "iot_data_db",
			SSLMode:  "disable",
		},
	}

	tmpl, err := template.New("pipelinesConfig").Parse(pipelinesConfigTmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return "", err
	}
	return buf.String(), nil
}
