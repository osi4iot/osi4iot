package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
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
				Name: "timescaledb.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["timescaledb"].ID,
			SecretName: sd.Secrets["timescaledb"].Name,
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

	ports := []swarm.PortConfig{}
	if pd.PlatformInfo.DeploymentMode == "development" {
		ports = []swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    5432,
				PublishedPort: 5432,
				PublishMode:   swarm.PortConfigPublishModeHost,
			},
		}
	}

	image := utils.GetServiceImage(pd, "timescaledb", "ghcr.io/osi4iot/timescaledb:2.27.0-pg18")
	return NewService("timescaledb", pd, sd).
		WithImage(image).
		WithEnv([]string{
			fmt.Sprintf("POSTGRES_DB=%s", pd.PlatformInfo.TimescaleDB),
			"POSTGRES_INITDB_WALDIR=/var/lib/postgresql_wal",
		}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["timescaledb_data"].Name,
				Target: "/var/lib/postgresql",
			},
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["timescaledb_wal"].Name,
				Target: "/var/lib/postgresql_wal",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPorts(ports).
		WithPlacement(constraints).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{
				Target:  sd.Networks["internal_net"].Name,
				Aliases: []string{"timescaledb"},
			},
		}).
		Build()
}
