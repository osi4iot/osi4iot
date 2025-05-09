package services

import (
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func S3StorageService(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "s3_storage.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["s3_storage"].ID,
			SecretName: sd.Secrets["s3_storage"].Name,
		},
	}

	configs := []*swarm.ConfigReference{
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/run/configs/s3_storage.conf",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["s3_storage"].ID,
			ConfigName: sd.Configs["s3_storage"].Name,
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

	return NewService("s3_storage", pd, sd).
		WithImage("ghcr.io/osi4iot/s3_storage:1.3.0").
		WithSecrets(secrets).
		WithConfigs(configs).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["s3_storage_data"].Name,
				Target: "/data",
			},
		}).
		WithResources(
			resources.CPUs("s3_storage", nodeRoleMaps),
			resources.Memory("s3_storage", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("s3_storage", nodeRoleMaps)).
		WithPorts([]swarm.PortConfig{
			{
				Protocol: swarm.PortConfigProtocolTCP, 
				TargetPort:    3500,
				PublishedPort: 3500,
			},
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()
}