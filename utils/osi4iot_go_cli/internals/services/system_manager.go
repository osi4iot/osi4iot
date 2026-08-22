package services

import (
	"fmt"
	"strings"
	"time"

	secrets "github.com/osi4iot/osi4iot/utils/osi4iot/internals/secrets"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// SystemManagerService builds the spec for the system_manager node.
func SystemManagerService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
) pt.Service {
	pi := pd.PlatformInfo
	numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
	natsSeedServers := secrets.NatsSeedServers(pd, numNatsReplicas, pi.DomainName)

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/run/secrets/system_manager.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["system_manager"].ID,
			SecretName: sd.Secrets["system_manager"].Name,
		},
	}

	env := []string{
		fmt.Sprintf("NATS_SEED_SERVERS_URL=%s", strings.Join(natsSeedServers, ",")),
	}

	if pi.UsePatroniTool {
		env = append(env, "USE_PATRONI_TOOL=true")
	}

	mounts := []mount.Mount{}
	placement := []string{}
	certRenewalEnabled := pi.DomainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider"
	if certRenewalEnabled {
		env = append(env, "CERT_RENEWAL_ENABLED=true")
		mounts = append(mounts,
			mount.Mount{
				Type:   mount.TypeBind,
				Source: "/var/run/docker.sock",
				Target: "/var/run/docker.sock",
			},
			mount.Mount{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["system_manager-data"].Name,
				Target: "/data/certrenewer",
			},
		)
		placement = append(placement, "node.role==manager")
	}

	image := utils.GetServiceImage(pd, "system_manager", "ghcr.io/osi4iot/system_manager:1.0.0")

	return NewService("system_manager", pd, sd).
		WithImage(image).
		WithHostname("system_manager").
		WithEnv(env).
		WithSecrets(secrets).
		WithMounts(mounts).
		WithPlacement(placement).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithHealthCheckOptions(
			[]string{"CMD-SHELL", "curl -sf http://localhost:8090/health || exit 1"},
			30*time.Second,
			5*time.Second,
			20*time.Second,
			3,
		).
		WithModeReplicated(func(v uint64) *uint64 { return &v }(1)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["nats_network"].Name},
		}).
		Build()
}
