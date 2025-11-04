package services

import (
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func PipelinesService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResourcesMap resources.SvcResourcesMap,
	nodeRoleMaps resources.NodesRoleMaps,
) pt.Service {
	volName := "pipelines_data_{{.Task.Slot}}"
	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/pipelines/config.yaml",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["pipelines_config"].ID,
			SecretName: sd.Secrets["pipelines_config"].Name,
		},
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

	return NewService("pipelines", pd, sd).
		WithImage("ghcr.io/osi4iot/pipelines:1.3.0").
		WithEnv([]string{
			"REPLICA={{.Task.Slot}}",
		}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volName].Name,
				Target: "/pipelines/data",
			},
		}).
		WithResources(
			resources.CPUs("pipelines", svcResourcesMap),
			resources.Memory("pipelines", svcResourcesMap),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GivePipelinesReplicsPtr(pd)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["nats_network"].Name},
		}).
		Build()
}
