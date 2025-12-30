package utils

import (
	"bytes"
	"fmt"
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
functionsTimeout: {{ .FunctionsTimeout }}
platformTelegramBotToken: "{{ .PlatformTelegramBotToken }}"
platformEmailPassword: "{{ .PlatformEmailPassword }}"
platformEmailUsername: "{{ .PlatformEmailUsername }}"
refreshThreshold: {{ .RefreshThreshold }}
shardCount: {{ .ShardCount }}
encryptionSecretKey: "{{ .EncryptionSecretKey }}"
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
	FunctionsTimeout         int
	TelegramBotToken         string
	PlatformEmailUsername    string
	PlatformEmailPassword    string
	PlatformTelegramBotToken string
	RefreshThreshold         uint
	ShardCount               int
	EncryptionSecretKey      string
	DefaultLlmModel          string
	DefaultLlmTemperature    float32
	DefaultLlmTopK           int32
	DefaultLlmTopP           float32
	LlmMaxTokens             int
	McpServersPath           string
	MaxChatMessagesPerUser   int
	PipelinesDataPath        string
	NATS                     NATSParams
	TimescaleDB              TimescaleDBParams
}

// PipelinesConfig generates a configuration string for the pipelines service.
func PipelinesConfig(pd *types.PlatformData, numNatsReplicas int) (string, error) {
	serversUrl := []string{}
	numNatsNodes := pd.PlatformInfo.NumOfNatsNodes
	numNatsSeedServers := Min(numNatsReplicas, 3)
	if numNatsNodes == 1 {
		for replica := 1; replica <= numNatsSeedServers; replica++ {
			port := 4222 + (replica - 1)
			natUrl := fmt.Sprintf("nats://nats%d:%d", replica, port)
			serversUrl = append(serversUrl, natUrl)
		}
	} else if numNatsNodes >= 3 {
		for replica := 1; replica <= numNatsSeedServers; replica++ {
			natUrl := fmt.Sprintf("nats://nats%d:4222", replica)
			serversUrl = append(serversUrl, natUrl)
		}
	}
	
	pi := pd.PlatformInfo
	numReplicas := GetServiceReplicas(pd, "pipelines")

	params := PipelinesParams{
		Mode:                   "prod",
		DomainName:             pi.DomainName,
		AdminUserName:          pi.PlatformAdminUserName,
		AdminPassword:          pi.PlatformAdminPassword,
		NumReplicas:            numReplicas,
		ReplicaIndex:           1,
		NumStreamReplicas:      1,
		FunctionsTimeout:       5000,
		TelegramBotToken:       pi.TelegramBotToken,
		PlatformEmailUsername:  pi.NotificationsEmailUser,
		PlatformEmailPassword:  pi.NotificationsEmailPassword,
		RefreshThreshold:       10,
		ShardCount:             8,
		EncryptionSecretKey:    pi.EncryptionSecretKey,
		DefaultLlmModel:        "openai:gpt-oss-120b",
		DefaultLlmTemperature:  0.7,
		DefaultLlmTopK:         40,
		DefaultLlmTopP:         0.95,
		LlmMaxTokens:           1000,
		McpServersPath:         "",
		MaxChatMessagesPerUser: 500,
		PipelinesDataPath:      "/pipelines/data/",

		NATS: NATSParams{
			ServersURL: serversUrl,
			Username:   pi.PlatformAdminUserName,
			Password:   pi.PlatformAdminPassword,
			Timeout:    "15s",
		},
		TimescaleDB: TimescaleDBParams{
			User:     pi.TimescaleUser,
			Password: pi.TimescalePassword,
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
