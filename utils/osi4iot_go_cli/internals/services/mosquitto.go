package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func MosquittoService(
	pd *pt.PlatformData, sd pt.SwarmData,
	svcResourcesMap resources.SvcResourcesMap,
	nodeRoleMaps resources.NodesRoleMaps,
) pt.Service {
	domainCertsType := pd.PlatformInfo.DomainCertsType

	mosquittoRule := fmt.Sprintf("Host(`%s`)", pd.PlatformInfo.DomainName)
	mosquittoRule8884 := fmt.Sprintf("HostSNI(`%s`)", pd.PlatformInfo.DomainName)
	resolver := ""

	annotationsLabels := map[string]string{
		"traefik.enable": "true",
		// MQTT without TLS (1883, TCP classic)
		"traefik.tcp.routers.mosquitto1883.rule":                      "HostSNI(`*`)",
		"traefik.tcp.routers.mosquitto1883.entrypoints":               "mqtt",
		"traefik.tcp.routers.mosquitto1883.service":                   "mosquitto1883",
		"traefik.tcp.services.mosquitto1883.loadbalancer.server.port": "1883",
		// MQTT over WebSockets (WSS) Port 9001
		"traefik.http.routers.mosquitto-wss.rule":                      mosquittoRule,
		"traefik.http.routers.mosquitto-wss.entrypoints":               "wss",
		"traefik.http.routers.mosquitto-wss.service":                   "mosquitto-wss",
		"traefik.http.routers.mosquitto-wss.tls":                       "true",
		"traefik.http.routers.mosquitto-wss.tls.certresolver":          resolver,
		"traefik.http.services.mosquitto-wss.loadbalancer.server.port": "9001",
	}

	if domainCertsType != "No certs" {
		// MQTT with TLS (8884, TCP)
		annotationsLabels["traefik.tcp.routers.mosquitto8884.rule"] = mosquittoRule8884
		annotationsLabels["traefik.tcp.routers.mosquitto8884.entrypoints"] = "mqtt-tls"
		annotationsLabels["traefik.tcp.routers.mosquitto8884.service"] = "mosquitto8884"
		annotationsLabels["traefik.tcp.routers.mosquitto8884.tls"] = "true"
		annotationsLabels["traefik.tcp.routers.mosquitto8884.tls.certresolver"] = resolver
		annotationsLabels["traefik.tcp.services.mosquitto8884.loadbalancer.server.port"] = "8884"
		annotationsLabels["traefik.http.routers.mosquitto-wss.tls.certresolver"] = resolver
	}

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/mosquitto/mqtt_certs/ca.crt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["mqtt_certs_ca_cert"].ID,
			SecretName: sd.Secrets["mqtt_certs_ca_cert"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/mosquitto/mqtt_certs/server.crt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["mqtt_broker_cert"].ID,
			SecretName: sd.Secrets["mqtt_broker_cert"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/mosquitto/mqtt_certs/server.key",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["mqtt_broker_key"].ID,
			SecretName: sd.Secrets["mqtt_broker_key"].Name,
		},
	}

	configs := []*swarm.ConfigReference{
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/etc/mosquitto/mosquitto.conf",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["mosquitto_conf"].ID,
			ConfigName: sd.Configs["mosquitto_conf"].Name,
		},
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/etc/mosquitto/conf.d/go-auth.conf",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["mosquitto_go_auth"].ID,
			ConfigName: sd.Configs["mosquitto_go_auth"].Name,
		},
	}

	constraints := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}

	if nodeRoleMaps.NodeRoleNumMap["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	return NewService("mosquitto", pd, sd).
		WithImage("ghcr.io/osi4iot/mosquitto_go_auth:2.1.0-mosquitto_2.0.15").
		WithAnnotationsLabels(annotationsLabels).
		WithSecrets(secrets).
		WithConfigs(configs).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["mosquitto_data"].Name,
				Target: "/mosquitto/data",
			},
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["mosquitto_log"].Name,
				Target: "/mosquitto/log",
			},
		}).
		WithResources(
			resources.CPUs("mosquitto", svcResourcesMap),
			resources.Memory("mosquitto", svcResourcesMap),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("mosquitto", nodeRoleMaps)).
		WithPorts([]swarm.PortConfig{
			{Protocol: swarm.PortConfigProtocolTCP, TargetPort: 8883, PublishedPort: 8883},
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}
