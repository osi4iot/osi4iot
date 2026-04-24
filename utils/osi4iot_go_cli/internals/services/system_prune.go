package services

import (
	"time"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func SystemPruneService(pd *pt.PlatformData, sd pt.SwarmData, svcResource resources.SvcResources) pt.Service {
	image := utils.GetServiceImage(pd, "system_prune", "ghcr.io/osi4iot/system_prune:latest")
	return NewService("system-prune", pd, sd).
		WithImage(image).
		WithCommand([]string{"docker", "system", "prune", "--all", "--force"}).
		WithMounts([]mount.Mount{
			{Type: mount.TypeBind, Source: "/var/run/docker.sock", Target: "/var/run/docker.sock"},
		}).
		WithResources(
			svcResource.NanoCPUs,
			svcResource.MemoryBytes,
		).
		WithRestartPolicy(24*time.Hour, swarm.RestartPolicyConditionAny).
		WithModeGlobal().
		Build()
}
