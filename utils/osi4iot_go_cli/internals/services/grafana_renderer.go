package services

import (
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func GrafanaRendererService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	nodeRoleNumMap map[string]int,
) pt.Service {

	constraints := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}

	if nodeRoleNumMap["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	image := utils.GetServiceImage(pd, "grafana_renderer", "ghcr.io/osi4iot/grafana_renderer:3.12.0")
	return NewService("grafana_renderer", pd, sd).
		WithImage(image).
		WithEnv([]string{
			"ENABLE_METRICS=true",
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(constraints).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithPorts([]swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    8081,
				PublishedPort: 8081,
			},
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()
}
