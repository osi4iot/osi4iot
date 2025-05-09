package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func NatsService(nodeId int, pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {
	// Define the NATS service
	serviceName := fmt.Sprintf("nats%d", nodeId)
	volName := fmt.Sprintf("nats%d_data", nodeId)

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

	ports := []swarm.PortConfig{
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    4222,
			PublishedPort: 4222,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    8222,
			PublishedPort: 8222,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    9001,
			PublishedPort: 9001,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    1883,
			PublishedPort: 1883,
		},
	}

	constraints := []string{
		"node.role==worker",
		fmt.Sprintf("node.labels.nats_%d==true", nodeId),
	}

	if nodeRoleMaps.NodeRoleNumMap["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	return NewService(serviceName, pd, sd).
		WithImage("ghcr.io/osi4iot/nats:2.11.1-alpine",).
		WithEnv([]string{
			fmt.Sprintf("SERVER_NAME=%s", serviceName),
		}).
		WithCommand([]string{"nats-server", "-c", "/etc/nats/nats.conf", "-js"}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volName].Name,
				Target: "/nats_data",
			},
		}).
		WithResources(
			resources.CPUs("nats", nodeRoleMaps),
			resources.Memory("nats", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("nats", nodeRoleMaps)).
		WithPorts(ports).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()
}