package services

import (
	"time"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func SystemPruneService(pd *pt.PlatformData, sd pt.SwarmData, svcResourcesMap resources.SvcResourcesMap) pt.Service {
	return NewService("system-prune", pd, sd).
		WithImage("ghcr.io/osi4iot/system_prune:latest").
		WithCommand([]string{"docker", "system", "prune", "--all", "--force"}).
		WithMounts([]mount.Mount{
			{Type: mount.TypeBind, Source: "/var/run/docker.sock", Target: "/var/run/docker.sock"},
		}).
		WithResources(
			resources.CPUs("system_prune", svcResourcesMap),
			resources.Memory("system_prune", svcResourcesMap),
		).
		WithRestartPolicy(24*time.Hour, swarm.RestartPolicyConditionAny).
		WithModeGlobal().
		Build()
}
