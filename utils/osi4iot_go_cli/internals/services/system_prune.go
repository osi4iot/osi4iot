package services

import (
	"time"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func SystemPruneService(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {
	return NewService("system-prune", pd, sd).
		WithImage("ghcr.io/osi4iot/system_prune:latest").
		WithCommand([]string{"docker", "system", "prune", "--all", "--force"}).
		WithMounts([]mount.Mount{
			{Type: mount.TypeBind, Source: "/var/run/docker.sock", Target: "/var/run/docker.sock"},
		}).
		WithResources(
			resources.CPUs("system_prune", nodeRoleMaps),
			resources.Memory("system_prune", nodeRoleMaps),
		).
		WithRestartPolicy(24*time.Hour, swarm.RestartPolicyConditionAny).
		WithModeGlobal().
		Build()
}
