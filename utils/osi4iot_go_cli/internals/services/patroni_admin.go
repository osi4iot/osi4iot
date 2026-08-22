package services

import (
	"fmt"
	"time"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// patroniAdminNode builds the service spec for one patroni-admin node.
//
// Each of the 3 nodes is identical except for:
//   - PATRONI_NAME  (patroni-admin1 / patroni-admin2 / patroni-admin3)
//   - placement constraint  (node.labels.admin-id == 1/2/3)
//   - data volume  (patroni-admin1-data / patroni-admin2-data / patroni-admin3-data)
//
// Secrets read by entrypoint.sh and post_init.sh:
//   - admin_postgres_password       → POSTGRES_PASSWORD (superuser)
//   - admin_postgres_admin_password → POSTGRES_ADMIN_PASSWORD (admin role)
//   - admin_postgres_replicator_pw  → POSTGRES_REPLICATOR_PASSWORD
//   - admin_postgres_rewind_pw      → POSTGRES_REWIND_PASSWORD
//   - postgres_grafana              → GRAFANA_DB_PASSWORD (post_init only)
//   - walg_libsodium_key            → WALG_LIBSODIUM_KEY (WAL-G encryption)
//
// WAL-G env vars are passed as environment variables because they contain
// non-secret configuration (S3 prefix, region, compression method).
// WALG_LIBSODIUM_KEY_TRANSFORM=hex is set in entrypoint.sh to avoid
// the Docker Buildkit false-positive secret scanner.
func patroniAdminNode(
	replica int, // 1, 2 or 3
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
) pt.Service {
	name := fmt.Sprintf("patroni-admin%d", replica)
	volumeName := fmt.Sprintf("patroni-admin%d-data", replica)

	pi := pd.PlatformInfo

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/run/secrets/patroni_admin.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["patroni_admin"].ID,
			SecretName: sd.Secrets["patroni_admin"].Name,
		},
	}

	env := []string{
		fmt.Sprintf("PATRONI_NAME=%s", name),
		fmt.Sprintf("PATRONI_NUM_NODES=%d", pd.PlatformInfo.NumPatroniAdminNodes),
	}

	// MinIO: only set endpoint and path-style when not using AWS S3
	if pi.S3BucketType == "Local Minio" {
		env = append(env,
			fmt.Sprintf("AWS_ENDPOINT=%s", pi.MinioEndpoint),
			"AWS_S3_FORCE_PATH_STYLE=true",
		)
	}

	image := utils.GetServiceImage(pd, "patroni_admin", "ghcr.io/osi4iot/patroni_admin:18.4-alpine3.24")

	return NewService(name, pd, sd).
		WithImage(image).
		WithHostname(name).
		WithEnv(env).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volumeName].Name,
				Target: "/data",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(patroniAdminPlacement(replica, pd.PlatformInfo)).
		WithHealthCheckOptions(
			[]string{
				"CMD-SHELL",
				"curl -sf http://localhost:8008/liveness || exit 1",
			},
			10*time.Second,
			5*time.Second,
			90*time.Second,
			5,
		).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["patroni_net"].Name},
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()
}

// PatroniAdminServices returns the 3 patroni-admin node services keyed by name.
// Call this from GenerateServices and merge into the services map.
func PatroniAdminServices(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
) map[string]pt.Service {
	n := pd.PlatformInfo.NumPatroniAdminNodes
	if n == 0 {
		n = 3 // safe default if not yet set
	}
	svcs := make(map[string]pt.Service, n)
	for i := 1; i <= n; i++ {
		svc := patroniAdminNode(i, pd, sd, svcResources)
		svcs[svc.Name] = svc
	}
	return svcs
}

func patroniAdminPlacement(replica int, pi pt.PlatformInfo) []string {
	if pi.NumPatroniAdminNodes <= 1 || pi.NumberOfSwarmNodes == 1 {
		return []string{}
	}
	return []string{
		fmt.Sprintf("node.labels.admin-id==%d", replica),
	}
}
