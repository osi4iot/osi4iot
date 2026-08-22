package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func PostgresService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	nodeRoleNumMaps map[string]int,
) pt.Service {

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "postgres.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["postgres"].ID,
			SecretName: sd.Secrets["postgres"].Name,
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

	image := utils.GetServiceImage(pd, "postgres", "ghcr.io/osi4iot/postgres:14.6-alpine")
	return NewService("postgres", pd, sd).
		WithImage(image).
		WithEnv([]string{
			fmt.Sprintf("POSTGRES_DB=%s", pd.PlatformInfo.PostgresDB),
		}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["pgdata"].Name,
				Target: "/var/lib/postgresql/data",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(constraints).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{
				Target:  sd.Networks["internal_net"].Name,
				Aliases: []string{"postgres"},
			},
		}).
		Build()
}
