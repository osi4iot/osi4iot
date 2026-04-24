package utils

import (
	"bytes"
	"fmt"
	"text/template"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

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
  useCustomCACert: {{ .NATS.UseCustomCACert }}

timescaledb:
  user: "{{ .TimescaleDB.User }}"
  password: "{{ .TimescaleDB.Password }}"
  host: "{{ .TimescaleDB.Host }}"
  port: {{ .TimescaleDB.Port }}
  dbName: "{{ .TimescaleDB.DBName }}"
  sslmode: "{{ .TimescaleDB.SSLMode }}"

awsS3:
  accessKeyId: "{{ .AwsS3.AccessKeyId }}"
  secretAccessKey: "{{ .AwsS3.SecretAccessKey }}"
  region: "{{ .AwsS3.Region }}"
  bucket: "{{ .AwsS3.Bucket }}"
  endpoint: "{{ .AwsS3.Endpoint }}"
`

type NATSParams struct {
	ServersURL []string
	Username   string
	Password   string
	Timeout    string
	UseCustomCACert string
}
type TimescaleDBParams struct {
	User     string
	Password string
	Host     string
	Port     int
	DBName   string
	SSLMode  string
}

type AwsS3Config struct {
	AccessKeyId     string `mapstructure:"accessKeyId"`
	SecretAccessKey string `mapstructure:"secretAccessKey"`
	Region          string `mapstructure:"region"`
	Bucket          string `mapstructure:"bucket"`
	Endpoint        string `mapstructure:"endpoint,omitempty"`
}

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
	AwsS3                    AwsS3Config
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
	numStreamReplicas := Min(numNatsReplicas, 3)

	awsAccessKeyId := pi.PlatformAdminUserName
	awsSecretAccessKey := pi.PlatformAdminPassword
	awsEndpoint := "http://minio:9000/"
	if (pi.DeploymentLocation == "AWS cluster deployment" || pi.S3BucketType == "Cloud AWS S3") {
		awsAccessKeyId = pi.AWSAccessKeyIDS3Bucket
		awsSecretAccessKey = pi.AWSSecretAccessKeyS3Bucket
		awsEndpoint = ""
	}

	params := PipelinesParams{
		Mode:                     "prod",
		DomainName:               pi.DomainName,
		AdminUserName:            pi.PlatformAdminUserName,
		AdminPassword:            pi.PlatformAdminPassword,
		NumReplicas:              numReplicas,
		ReplicaIndex:             1,
		NumStreamReplicas:        numStreamReplicas,
		FunctionsTimeout:         5000,
		PlatformTelegramBotToken: pi.TelegramBotToken,
		PlatformEmailUsername:    pi.NotificationsEmailUser,
		PlatformEmailPassword:    pi.NotificationsEmailPassword,
		RefreshThreshold:         10,
		ShardCount:               8,
		EncryptionSecretKey:      pi.EncryptionSecretKey,
		DefaultLlmModel:          "openai:gpt-oss-120b",
		DefaultLlmTemperature:    0.7,
		DefaultLlmTopK:           40,
		DefaultLlmTopP:           0.95,
		LlmMaxTokens:             1000,
		McpServersPath:           "",
		MaxChatMessagesPerUser:   500,
		PipelinesDataPath:        "/pipelines/data/",

		NATS: NATSParams{
			ServersURL:      serversUrl,
			Username:        pi.PlatformAdminUserName,
			Password:        pi.PlatformAdminPassword,
			Timeout:         "15s",
			UseCustomCACert: pi.UseCustomNatsCACert,
		},
		TimescaleDB: TimescaleDBParams{
			User:     pi.TimescaleUser,
			Password: pi.TimescalePassword,
			Host:     "timescaledb",
			Port:     5432,
			DBName:   "iot_data_db",
			SSLMode:  "disable",
		},
		AwsS3: AwsS3Config{
			AccessKeyId:     awsAccessKeyId,
			SecretAccessKey: awsSecretAccessKey,
			Region:          pi.AWSRegionS3Bucket,
			Bucket:          pi.S3BucketName,
			Endpoint:        awsEndpoint,
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
