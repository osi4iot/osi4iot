package services

import (
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func GrafanaRendererService(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {

	constraints := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}

	if nodeRoleMaps.NodeRoleNumMap["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	return NewService("grafana_renderer", pd, sd).
		WithImage("ghcr.io/osi4iot/grafana_renderer:3.12.0").
		WithEnv([]string{
			"ENABLE_METRICS=true",
		}).
		WithResources(
			resources.CPUs("grafana_renderer", nodeRoleMaps),
			resources.Memory("grafana_renderer", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("grafana_renderer", nodeRoleMaps)).
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
