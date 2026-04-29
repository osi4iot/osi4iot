package services

import (
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func AuthCalloutService(
	pd *pt.PlatformData, 
	sd pt.SwarmData, 
	svcResources resources.SvcResources,
	nodeRoleNumMap map[string]int,
	) pt.Service {

	secrets := []*swarm.SecretReference{
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

	if nodeRoleNumMap["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	image := utils.GetServiceImage(pd, "auth_callout", "ghcr.io/osi4iot/auth_callout:1.3.0")

	return NewService("auth_callout", pd, sd).
		WithImage(image).
		WithSecrets(secrets).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(constraints).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithPorts([]swarm.PortConfig{
			{Protocol: swarm.PortConfigProtocolTCP, TargetPort: 8883, PublishedPort: 8883},
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["nats_network"].Name},
		}).
		Build()

}
