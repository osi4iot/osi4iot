package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func KeepalivedService(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {

	constraints := []string{
		"node.role == manager",
		"node.platform.arch==x86_64",
	}

	return NewService("keepalived", pd, sd).
		WithImage("ghcr.io/osi4iot/keepalived:latest").
		WithEnv([]string{
			fmt.Sprintf("KEEPALIVED_VIRTUAL_IP=%s", pd.PlatformInfo.FloatingIPAddress),
			fmt.Sprintf("KEEPALIVED_INTERFACE=%s", pd.PlatformInfo.NetworkInterface),
		}).
		WithMounts([]mount.Mount{
			{
				Target:   "/var/run/docker.sock",
				Source:   "/var/run/docker.sock",
				Type:     mount.TypeBind,
				ReadOnly: true,
			},
			{
				Target:   "/usr/bin/docker",
				Source:   "/usr/bin/docker:ro",
				Type:     mount.TypeBind,
				ReadOnly: true,
			},
		}).
		WithResources(
			resources.CPUs("keepalived", nodeRoleMaps),
			resources.Memory("keepalived", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithGlobal().
		WithModeReplicated(resources.GiveReplicsPtr("keepalived", nodeRoleMaps)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()
}
