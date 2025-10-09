package utils

import (
	"bytes"
	"fmt"
	"text/template"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

// Dev2pdbConfig generates a configuration string for the dev2pdb service.
// It uses a template to fill in the parameters for the configuration file.
var dev2pdbConfigTmpl = `
mode: "{{ .Mode }}"  # options: "local", "prod"

# Domain name used for TLS in MQTT (and for NATS if you need it)
domainName: "{{ .DomainName }}"

# Messaging configuration
messagingType: "{{ .MessagingType }}"  # options: "mqtt" or "nats

# Number of workers
numWorkers: {{ .NumWorkers }}

# Batch size
batchSize: {{ .BatchSize }}

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
	NATS          NATSParams
	TimescaleDB   TimescaleDBParams
	NumWorkers    int
	BatchSize     int
}

// Dev2pdbConfig generates a configuration string for the dev2pdb service.
func Dev2pdbConfig(pd *types.PlatformData, nodeRoleNumMap map[string]int) (string, error) {
	serversUrl := []string{}
	for inode:=0; inode <pd.PlatformInfo.NumNatsClusterNodes; inode++ {
		natUrl := fmt.Sprintf("nats://nats%d:4222", inode+1)
		serversUrl = append(serversUrl, natUrl)
	}

	params := Dev2pdbParams{
		Mode:          "prod",
		DomainName:    pd.PlatformInfo.DomainName,
		NumWorkers:    pd.PlatformInfo.NumberDev2pdbWorkers,
		BatchSize:     pd.PlatformInfo.Dev2pdbBatchSize,
		NATS: NATSParams{
			ServersURL: serversUrl,
			Username:   "dev2pdb",
			Password:   pd.PlatformInfo.Dev2pdbPassword,
			Timeout:    "15s",
		},
		TimescaleDB: TimescaleDBParams{
			User:     pd.PlatformInfo.TimescaleUser,
			Password: pd.PlatformInfo.TimescalePassword,
			Host:     "timescaledb",
			Port:     5432,
			DBName:   "iot_data_db",
			SSLMode:  "disable",
		},
	}

	tmpl, err := template.New("dev2pdbConfig").Parse(dev2pdbConfigTmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return "", err
	}
	return buf.String(), nil
}
