package services

import (
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func PipelinesService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	nodeRoleNumMaps map[string]int,
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
	}

	constraints := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}

	if nodeRoleNumMaps["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	image := utils.GetServiceImage(pd, "pipelines", "ghcr.io/osi4iot/pipelines:1.3.0")
	return NewService("pipelines", pd, sd).
		WithImage(image).
		WithCommand([]string{"sh", "-c"}).
		WithArgs([]string{
			"echo 'Waiting for auth_callout...' && " +
				"until curl -sf http://auth_callout:3300/health > /dev/null 2>&1; do " +
				"  sleep 3; " +
				"done && " +
				"echo 'auth_callout ready' && " +
				"echo 'Waiting for timescaledb...' && " +
				"until nc -z timescaledb 5432 > /dev/null 2>&1; do " +
				"  sleep 2; " +
				"done && " +
				"echo 'timescaledb ready' && " +
				"echo 'All dependencies ready, starting pipelines...' && " +
				"exec pipelines",
		}).
		WithEnv([]string{
			"REPLICA={{.Task.Slot}}",
		}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: volName,
				Target: "/pipelines/data",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(constraints).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["nats_network"].Name},
		}).
		Build()
}
