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

// patroniMetricsNode builds the service spec for one patroni-metrics node.
//
// Each of the 3 nodes is identical except for:
//   - PATRONI_NAME  (patroni-metrics1 / patroni-metrics2 / patroni-metrics3)
//   - placement constraint  (node.labels.metrics-id == 1/2/3)
//   - data volume  (patroni-metrics1-data / patroni-metrics2-data / patroni-metrics3-data)
//
// Secrets read by entrypoint.sh and post_init.sh:
//   - metrics_postgres_password       → POSTGRES_PASSWORD (superuser)
//   - metrics_postgres_admin_password → POSTGRES_ADMIN_PASSWORD (admin role)
//   - metrics_postgres_replicator_pw  → POSTGRES_REPLICATOR_PASSWORD
//   - metrics_postgres_rewind_pw      → POSTGRES_REWIND_PASSWORD
//   - timescaledb_grafana             → GRAFANA_DATASOURCE_PASSWORD (post_init only)
//   - timescaledb_data_ret_int        → DATA_RETENTION_INTERVAL (post_init only)
//   - walg_libsodium_key              → WALG_LIBSODIUM_KEY (WAL-G encryption)
//
// Secret key names in sd.Secrets mirror the existing timescaledb.go convention:
//
//	timescale_user → timescale_grafana → timescale_data_ret_int
//
// which map to the Swarm secret names registered in setup.sh.
func patroniMetricsNode(
	replica int, // 1, 2 or 3
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
) pt.Service {
	name := fmt.Sprintf("patroni-metrics%d", replica)
	volumeData := fmt.Sprintf("patroni-metrics%d-data", replica)
	volumeWal := fmt.Sprintf("patroni-metrics%d-wal", replica)

	pi := pd.PlatformInfo

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/run/secrets/patroni_metrics.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["patroni_metrics"].ID,
			SecretName: sd.Secrets["patroni_metrics"].Name,
		},
	}

	env := []string{
		fmt.Sprintf("PATRONI_NAME=%s", name),
		fmt.Sprintf("PATRONI_NUM_NODES=%d", pd.PlatformInfo.NumPatroniMetricsNodes),
	}

	if pi.S3BucketType == "Local Minio" {
		env = append(env,
			fmt.Sprintf("AWS_ENDPOINT=%s", pi.MinioEndpoint),
			"AWS_S3_FORCE_PATH_STYLE=true",
		)
	}

	image := utils.GetServiceImage(pd, "patroni_metrics", "ghcr.io/osi4iot/patroni_metrics:2.29.1-pg18")

	return NewService(name, pd, sd).
		WithImage(image).
		WithHostname(name).
		WithEnv(env).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volumeData].Name,
				Target: "/data",
			},
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volumeWal].Name,
				Target: "/wal",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(patroniMetricsPlacement(replica, pd.PlatformInfo)).
		WithHealthCheckOptions(
			[]string{
				"CMD-SHELL",
				// "curl -sf http://localhost:8008/health || exit 1",
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

// PatroniMetricsServices returns the 3 patroni-metrics node services keyed by name.
// Call this from GenerateServices and merge into the services map.
func PatroniMetricsServices(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
) map[string]pt.Service {
	n := pd.PlatformInfo.NumPatroniMetricsNodes
	if n == 0 {
		n = 3 // safe default if not yet set
	}
	svcs := make(map[string]pt.Service, n)
	for i := 1; i <= n; i++ {
		svc := patroniMetricsNode(i, pd, sd, svcResources)
		svcs[svc.Name] = svc
	}
	return svcs
}

func patroniMetricsPlacement(replica int, pi pt.PlatformInfo) []string {
	if pi.NumPatroniMetricsNodes <= 1 || pi.NumberOfSwarmNodes == 1 {
		return []string{}
	}
	return []string{
		fmt.Sprintf("node.labels.metrics-id==%d", replica),
	}
}
