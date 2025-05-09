package services

import (
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func Dev2pdbService(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/dev2pdb/config.yaml",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["dev2pdb_config"].ID,
			SecretName: sd.Secrets["dev2pdb_config"].Name,
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

	return NewService("dev2pdb", pd, sd).
		WithImage("ghcr.io/osi4iot/dev2pdb_nats:1.3.0").
		WithSecrets(secrets).
		WithResources(
			resources.CPUs("dev2pdb", nodeRoleMaps),
			resources.Memory("dev2pdb", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("dev2pdb", nodeRoleMaps)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()
}
