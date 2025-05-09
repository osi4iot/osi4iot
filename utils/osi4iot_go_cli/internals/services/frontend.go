package services

import (
	"fmt"

	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func FrontendService(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {
	domainName := pd.PlatformInfo.DomainName

	frontendRule := fmt.Sprintf("Host(`%s`)", domainName)
	annotationsLabels := map[string]string{
		"traefik.enable":                     "true",
		"traefik.http.routers.frontend.rule": frontendRule,
		"traefik.http.routers.frontend.entrypoints":                        "websecure",
		"traefik.http.routers.frontend.tls":                                "true",
		"traefik.http.routers.frontend.tls.certresolver":                   "",
		"traefik.http.routers.frontend.service":                            "frontend",
		"traefik.http.services.frontend.loadbalancer.server.port":          "80",
		"traefik.http.services.frontend.loadbalancer.healthCheck.path":     "/health",
		"traefik.http.services.frontend.loadbalancer.healthCheck.interval": "5s",
		"traefik.http.services.frontend.loadbalancer.healthCheck.timeout":  "3s",
	}

    configs := []*swarm.ConfigReference{
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/run/configs/frontend.conf",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["frontend"].ID,
			ConfigName: sd.Configs["frontend"].Name,
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

	return NewService("frontend", pd, sd).
		WithImage("ghcr.io/osi4iot/frontend:1.3.0").
		WithAnnotationsLabels(annotationsLabels).
		WithConfigs(configs).
		WithResources(
			resources.CPUs("frontend", nodeRoleMaps),
			resources.Memory("frontend", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("frontend", nodeRoleMaps)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}
