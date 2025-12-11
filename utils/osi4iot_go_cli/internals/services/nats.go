package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func NatsService(
	nodeId int,
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	nodeRoleNumMaps map[string]int,
) pt.Service {
	// Define the NATS service
	serviceName := fmt.Sprintf("nats%d", nodeId)
	volName := fmt.Sprintf("nats%d_data", nodeId)
	numNodes := len(pd.PlatformInfo.NodesData)
	numNatsClusterNodes := pd.PlatformInfo.NumNatsClusterNodes
	domainName := pd.PlatformInfo.DomainName

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/ca.pem",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["iot_platform_ca_cert"].ID,
			SecretName: sd.Secrets["iot_platform_ca_cert"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/cert.pem",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["iot_platform_cert"].ID,
			SecretName: sd.Secrets["iot_platform_cert"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/key.pem",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["iot_platform_key"].ID,
			SecretName: sd.Secrets["iot_platform_key"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/nats.conf",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["nats_config"].ID,
			SecretName: sd.Secrets["nats_config"].Name,
		},
	}

	var natsPort uint32 = 4222
	var metricPort uint32 = 8222
	var mqttPort uint32 = 1883
	var websocketPort uint32 = 9001
	if numNodes == 1 && numNatsClusterNodes > 1 {
		natsPort = uint32(4222 + (nodeId - 1))
		metricPort = uint32(8222 + (nodeId - 1))
		websocketPort = uint32(9001 + (nodeId - 1))
		mqttPort = uint32(1883 + (nodeId - 1))
	}

	ports := []swarm.PortConfig{
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    4222,
			PublishedPort: natsPort,
			PublishMode:   swarm.PortConfigPublishModeHost,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    8222,
			PublishedPort: metricPort,
			PublishMode:   swarm.PortConfigPublishModeHost,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    9001,
			PublishedPort: websocketPort,
			PublishMode:   swarm.PortConfigPublishModeHost,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    1883,
			PublishedPort: mqttPort,
			PublishMode:   swarm.PortConfigPublishModeHost,
		},
	}

	constraints := []string{
		"node.role==worker",
		fmt.Sprintf("node.labels.nats_%d==true", nodeId),
	}

	if nodeRoleNumMaps["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	return NewService(serviceName, pd, sd).
		WithImage("ghcr.io/osi4iot/nats:2.11.1-alpine").
		WithHostname(serviceName).
		WithEnv([]string{
			fmt.Sprintf("SERVER_NAME=\"%s\"", serviceName),
		}).
		WithCommand([]string{"nats-server", "-c", "/etc/nats/nats.conf", "-js"}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volName].Name,
				Target: "/data/nats",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(constraints).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithPorts(ports).
		WithHealthCheck([]string{
			"CMD-SHELL",
			"wget -qO- http://localhost:8222/healthz | grep -q '\"status\":\"ok\"' || exit 0",
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["nats_network"].Name, Aliases: []string{fmt.Sprintf("nats%d.%s", nodeId, domainName)}},
		}).
		Build()
}
