package utils

import (
	"bytes"
	"text/template"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

// Dev2pdbConfig generates a configuration string for the dev2pdb service.
// It uses a template to fill in the parameters for the configuration file.
var configTmpl = `
mode: "{{ .Mode }}"  # options: "dev", "prod"

# Domain name used for TLS in MQTT (and for NATS if you need it)
domainName: "{{ .DomainName }}"

# Messaging configuration
messagingType: "{{ .MessagingType }}"  # options: "mqtt" or "nats

# Number of workers
numWorkers: {{ .NumWorkers }}

mqtt:
  clientID: "{{ .MQTT.ClientID }}"
  broker: "{{ .MQTT.Broker }}"
  port: {{ .MQTT.Port }}
  username: "{{ .MQTT.Username }}"
  password: "{{ .MQTT.Password }}"
  tlsInsecureSkipVerify: {{ .MQTT.TLSInsecureSkipVerify }}

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

type MQTTParams struct {
	ClientID              string
	Broker                string
	Port                  int
	Username              string
	Password              string
	TLSInsecureSkipVerify bool
}
type NATSParams struct {
	ServersURL []string
	Username   string
	Password   string
	Timeout    string
}
type TimescaleDBParams struct {
	User     string
	Password string
	Host     string
	Port     int
	DBName   string
	SSLMode  string
}

type Dev2pdbParams struct {
	Mode          string
	DomainName    string
	MessagingType string
	MQTT          MQTTParams
	NATS          NATSParams
	TimescaleDB   TimescaleDBParams
	NumWorkers   int
}

// Dev2pdbConfig generates a configuration string for the dev2pdb service.
func Dev2pdbConfig(platformData *types.PlatformData, nodeRoleNumMap map[string]int) (string, error) {
	serversUrl := []string{"nats://nats1:4222"}
	if nodeRoleNumMap["Platform worker"] >= 3 {
		serversUrl = append(serversUrl, "nats://nats2:4222")
		serversUrl = append(serversUrl, "nats://nats3:4222")
	}

	messagingType := "mqtt"
	if platformData.PlatformInfo.MessagingSystem == "nats" {
		messagingType = "nats"
	}

	params := Dev2pdbParams{
		Mode:          "prod",
		DomainName:    platformData.PlatformInfo.DomainName,
		NumWorkers:    5,
		MessagingType: messagingType,
		MQTT: MQTTParams{
			ClientID:              "dev2pdb",
			Broker:                "mosquitto",
			Port:                  1883,
			Username:              "dev2pdb",
			Password:              platformData.PlatformInfo.Dev2pdbPassword,
			TLSInsecureSkipVerify: true,
		},
		NATS: NATSParams{
			ServersURL: serversUrl,
			Username:   "dev2pdb",
			Password:   platformData.PlatformInfo.Dev2pdbPassword,
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

	tmpl, err := template.New("dev2pdbConfig").Parse(configTmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return "", err
	}
	return buf.String(), nil
}
