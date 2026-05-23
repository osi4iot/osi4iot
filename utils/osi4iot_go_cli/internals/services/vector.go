package services

import (
	"fmt"
	"strings"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	secrets_pkg "github.com/osi4iot/osi4iot/utils/osi4iot/internals/secrets"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func VectorService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
) pt.Service {

	configs := []*swarm.ConfigReference{
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/etc/vector/vector.yaml",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["vector"].ID,
			ConfigName: sd.Configs["vector"].Name,
		},
	}

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "vector_credentials.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["vector_credentials"].ID,
			SecretName: sd.Secrets["vector_credentials"].Name,
		},
	}

	numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
	natsSeedServers := secrets_pkg.NatsSeedServers(pd, numNatsReplicas, pd.PlatformInfo.DomainName)

	image := utils.GetServiceImage(pd, "vector", "ghcr.io/osi4iot/vector:0.46.1-alpine")
	return NewService("vector", pd, sd).
		WithImage(image).
		WithHostname("{{.Node.Hostname}}").
		WithCommand([]string{"sh", "-c"}).
		WithArgs([]string{
			"export $(cat /run/secrets/vector_credentials.txt | xargs) && " +
				"echo 'Waiting for auth_callout...' && " +
				"until wget -qO- http://auth_callout:3300/health > /dev/null 2>&1; do " +
				"  sleep 3; " +
				"done && " +
				"echo 'auth_callout ready' && " +
				"echo 'Waiting for timescaledb...' && " +
				"until nc -z timescaledb 5432 > /dev/null 2>&1; do " +
				"  sleep 2; " +
				"done && " +
				"echo 'timescaledb ready' && " +
				"echo 'All dependencies ready, starting Vector...' && " +
				"exec /usr/local/bin/vector --config /etc/vector/vector.yaml",
		}).
		WithEnv([]string{
			"VECTOR_LOG=warn",
			"DB_HOST=timescaledb",
			"DB_PORT=5432",
			fmt.Sprintf("NATS_SEED_SERVERS_URL=%s", strings.Join(natsSeedServers, ",")),
			fmt.Sprintf("DB_NAME=%s", pd.PlatformInfo.TimescaleDB),
			fmt.Sprintf("DB_USER=%s", pd.PlatformInfo.TimescaleUser),
			"PROCFS_ROOT=/host/proc",
			"SYSFS_ROOT=/host/sys",
			"DOCKER_ROOT=/var/lib/docker",
			"HOSTFS_ROOT=/host",
		}).
		WithSecrets(secrets).
		WithConfigs(configs).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeBind,
				Source: "/var/run/docker.sock",
				Target: "/var/run/docker.sock",
			},
			{
				Type:   mount.TypeBind,
				Source: "/var/lib/docker/containers",
				Target: "/var/lib/docker/containers",
			},
			{
				Type:     mount.TypeBind,
				Source:   "/var/lib/docker/volumes",
				Target:   "/var/lib/docker/volumes",
				ReadOnly: true,
			},
			{
				Type:     mount.TypeBind,
				Source:   "/proc",
				Target:   "/host/proc",
				ReadOnly: true,
			},
			{
				Type:     mount.TypeBind,
				Source:   "/sys",
				Target:   "/host/sys",
				ReadOnly: true,
			},
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["vector_buffer"].Name,
				Target: "/var/lib/vector",
			},
			{
				Type:     mount.TypeBind,
				Source:   "/",
				Target:   "/host",
				ReadOnly: true,
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithModeGlobal().
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["nats_network"].Name},
		}).
		Build()
}
