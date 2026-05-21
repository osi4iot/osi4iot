package secrets

import (
	"bytes"
	"fmt"
	"text/template"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

type NatsConfigParams struct {
	NatsAdminUsername   string
	NatsAdminPassword   string
	NatsAdminNkeyPublic string
	NatsSystemPassword  string
	NatsIssuerPublicKey string
	NatsXKeyPublicKey   string
	ClusterRoutes       []string
	UseCustomCACert     string
}

const configTemplate = `
server_name: $SERVER_NAME

listen: 0.0.0.0:4222
http_port: 8222
lame_duck_grace_period: "10s"
lame_duck_duration: "2m"

tls {
  cert_file: "/etc/nats/cert.pem"
  key_file:  "/etc/nats/key.pem"
{{- if eq .UseCustomCACert "Yes" }}
  ca_file:   "/etc/nats/ca.pem"
{{- end }}
  verify: false
}  

jetstream {
  store_dir: "/data/nats"
  max_memory_store: 1G
  max_file_store: 100G
  sync_interval: "10s"
  max_outstanding_catchup: 524288000
  max_buffered_msgs: 5000000
  max_buffered_size: 5368709120
}

mqtt {
  port: 1883
  tls {
    cert_file: "/etc/nats/cert.pem"
    key_file:  "/etc/nats/key.pem"
    verify: false
  }
}

websocket {
  port: 9001
  tls {
    cert_file: "/etc/nats/cert.pem"
    key_file:  "/etc/nats/key.pem"
    verify: false
  }
}

accounts {
  AUTH {
    users: [
      { user: "{{.NatsAdminUsername}}", password: "{{.NatsAdminPassword}}" }
      { nkey:  "{{.NatsAdminNkeyPublic}}" }
    ],
    jetstream: enabled
  }
  APP {
    jetstream: enabled
  }
  SYS {
    users: [{ user: sys, password: "{{.NatsAdminPassword}}" }]
  }
}
system_account: SYS

authorization {
  auth_callout {
    issuer: "{{.NatsIssuerPublicKey}}"
    auth_users: [ "{{.NatsAdminUsername}}" ]
    account: AUTH
    xkey:  "{{.NatsXKeyPublicKey}}"
  }
}

{{- if ge (len .ClusterRoutes) 3 }}
cluster {
  name: "NATS_CLUSTER"
  listen: "0.0.0.0:6222"
  routes: [
    {{- range .ClusterRoutes }}
    "nats://{{ . }}",
    {{- end }}
  ]
}
{{- end }}
`

func NatsRenderConfig(params NatsConfigParams) (string, error) {
	tmpl, err := template.New("natsConfig").Parse(configTemplate)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func CreateNatsConfigSecret(
	pd *pt.PlatformData,
	numNatsReplicas int,
) pt.Secret {
	clusterRoutes := []string{}
	for iNatsNode := 1; iNatsNode <= numNatsReplicas; iNatsNode++ {
		clusterRoutes = append(clusterRoutes, fmt.Sprintf("nats%d:6222", iNatsNode))
	}

	params := NatsConfigParams{
		NatsAdminUsername:   pd.Certs.NatsCerts.NatsAdminUsername,
		NatsAdminPassword:   pd.Certs.NatsCerts.NatsAdminPassword,
		NatsAdminNkeyPublic: pd.Certs.NatsCerts.NatsAdminNkeyPublic,
		NatsIssuerPublicKey: pd.Certs.NatsCerts.NatsIssuerPublicKey,
		NatsXKeyPublicKey:   pd.Certs.NatsCerts.NatsXKeyPublicKey,
		ClusterRoutes:       clusterRoutes,
	}

	cfgStr, _ :=NatsRenderConfig(params)
	natsConfigHash := utils.GetMD5Hash(cfgStr)
	natsConfigName := fmt.Sprintf("nats_config_%s", natsConfigHash)
	natsConfigSecret := pt.Secret{
		Name: natsConfigName,
		Data: cfgStr,
	}

	return natsConfigSecret
}

func NatsSeedServers(pd *pt.PlatformData, numNatsReplicas int, hostName string) []string {
	serversUrl := []string{}
	numNatsNodes := pd.PlatformInfo.NumOfNatsNodes
	numNatsSeedServers := utils.Min(numNatsReplicas, 3)
	if numNatsNodes == 1 {
		for replica := 1; replica <= numNatsSeedServers; replica++ {
			port := 4222 + (replica - 1)
			natUrl := fmt.Sprintf("nats://nats%d:%d", replica, port)
			if hostName != "" {
				natUrl = fmt.Sprintf("nats://nats%d.%s:%d", replica, hostName, port)
			}
			serversUrl = append(serversUrl, natUrl)
		}
	} else if numNatsNodes >= 3 {
		for replica := 1; replica <= numNatsSeedServers; replica++ {
			natUrl := fmt.Sprintf("nats://nats%d:4222", replica)
			if hostName != "" {
				natUrl = fmt.Sprintf("nats://nats%d.%s:4222", replica, hostName)
			}
			serversUrl = append(serversUrl, natUrl)
		}
	}

	return serversUrl
}
