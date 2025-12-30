package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

func TimescaledbService(
	pd *pt.PlatformData, 
	sd pt.SwarmData, 
	svcResources resources.SvcResources,
	nodeRoleNumMaps map[string]int,
	) pt.Service {

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "timescaledb_user.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["timescale_user"].ID,
			SecretName: sd.Secrets["timescale_user"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "timescaledb_password.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["timescale_password"].ID,
			SecretName: sd.Secrets["timescale_password"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "timescaledb_grafana.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["timescale_grafana"].ID,
			SecretName: sd.Secrets["timescale_grafana"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "timescaledb_data_ret_int.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["timescale_data_ret_int"].ID,
			SecretName: sd.Secrets["timescale_data_ret_int"].Name,
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

	image := utils.GetServiceImage(pd, "timescaledb", "ghcr.io/osi4iot/timescaledb:2.20.0-pg17")
	return NewService("timescaledb", pd, sd).
		//WithImage("ghcr.io/osi4iot/timescaledb:2.4.2-pg13").
		WithImage(image).
		WithEnv([]string{
			fmt.Sprintf("POSTGRES_DB=%s", pd.PlatformInfo.TimescaleDB),
			"POSTGRES_PASSWORD_FILE=/run/secrets/timescaledb_password.txt",
			"POSTGRES_USER_FILE=/run/secrets/timescaledb_user.txt",
			"POSTGRES_INITDB_WALDIR=/var/lib/postgresql/pg_wal",
		}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["timescaledb_data"].Name,
				Target: "/var/lib/postgresql/data",
			},
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["timescaledb_wal"].Name,
				Target: "/var/lib/postgresql/pg_wal",
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
