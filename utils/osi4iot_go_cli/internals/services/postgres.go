package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
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
				Name: "postgres_user.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["postgres_user"].ID,
			SecretName: sd.Secrets["postgres_user"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "postgres_password.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["postgres_password"].ID,
			SecretName: sd.Secrets["postgres_password"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "postgres_grafana.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["postgres_grafana"].ID,
			SecretName: sd.Secrets["postgres_grafana"].Name,
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

	return NewService("postgres", pd, sd).
		WithImage("ghcr.io/osi4iot/postgres:14.6-alpine").
		WithEnv([]string{
			fmt.Sprintf("POSTGRES_DB=%s", pd.PlatformInfo.PostgresDB),
			"POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password.txt",
			"POSTGRES_USER_FILE=/run/secrets/postgres_user.txt",
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
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()
}
