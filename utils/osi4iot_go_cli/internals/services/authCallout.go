package services

import (
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func AuthCalloutService(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {

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
				Name: "/auth_callout/config.env",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["auth_callout"].ID,
			SecretName: sd.Secrets["auth_callout"].Name,
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


	return NewService("auth_callout", pd, sd).
		WithImage("ghcr.io/osi4iot/auth_callout:1.3.0").
		WithSecrets(secrets).
		WithResources(
			resources.CPUs("auth_callout", nodeRoleMaps),
			resources.Memory("auth_callout", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("auth_callout", nodeRoleMaps)).
		WithPorts([]swarm.PortConfig{
			{Protocol: swarm.PortConfigProtocolTCP, TargetPort: 8883, PublishedPort: 8883},
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()

}
