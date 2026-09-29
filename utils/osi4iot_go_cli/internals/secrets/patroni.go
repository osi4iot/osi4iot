package secrets

import (
	"fmt"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func createPatroniSecrets(pd *pt.PlatformData) map[string]pt.Secret {
	secrets := make(map[string]pt.Secret)
	pi := pd.PlatformInfo

	awsAccessKeyId := pi.PlatformAdminUserName
	awsSecretAccessKey := pi.PlatformAdminPassword
	awsRegion := "us-east-1"
	if pi.S3BucketType == "Cloud AWS S3" {
		awsAccessKeyId = pi.AWSAccessKeyIDS3Bucket
		awsSecretAccessKey = pi.AWSSecretAccessKeyS3Bucket
		awsRegion =utils.AwsRegionCode(pi.AWSRegionS3Bucket)
	}
 
	adminLines := []string{
		fmt.Sprintf("PATRONI_ADMIN_PASSWORD=%s", pi.PostgresPassword),
		fmt.Sprintf("PATRONI_ADMIN_REPLICATOR_PASSWORD=%s", pi.PostgresReplicatorPassword),
		fmt.Sprintf("PATRONI_ADMIN_REWIND_PASSWORD=%s", pi.PostgresRewindPassword),
		fmt.Sprintf("PATRONI_ADMIN_RESTAPI_PASSWORD=%s", pi.PatroniAdminRestAPIPassword),
		fmt.Sprintf("SUPERADMIN_USER=%s", pi.PlatformAdminUserName),
		fmt.Sprintf("SUPERADMIN_PASSWORD=%s", pi.PlatformAdminPassword),
		fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", pi.GrafanaDBPassword),
		fmt.Sprintf("POSTGRES_DB=%s", pi.PostgresDB),
		fmt.Sprintf("WALG_LIBSODIUM_KEY=%s", pi.WalgLibsodiumKey),
		fmt.Sprintf("WALG_S3_PREFIX=%s", pi.WalgS3PrefixAdmin),
		fmt.Sprintf("WALG_COMPRESSION_METHOD=%s", pi.WalgCompressionMethod),
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", awsAccessKeyId),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", awsSecretAccessKey),
		fmt.Sprintf("AWS_REGION=%s", awsRegion),
	}
	adminLines = appendSidecarToken(adminLines, pi)
	adminData := strings.Join(adminLines, "\n")
	adminHash := utils.GetMD5Hash(adminData)
	secrets["patroni_admin"] = pt.Secret{
		Name: fmt.Sprintf("patroni_admin_%s", adminHash),
		Data: adminData,
	}
 
	metricsLines := []string{
		fmt.Sprintf("PATRONI_METRICS_PASSWORD=%s", pi.TimescalePassword),
		fmt.Sprintf("PATRONI_METRICS_REPLICATOR_PASSWORD=%s", pi.TimescaleReplicatorPassword),
		fmt.Sprintf("PATRONI_METRICS_REWIND_PASSWORD=%s", pi.TimescaleRewindPassword),
		fmt.Sprintf("PATRONI_METRICS_RESTAPI_PASSWORD=%s", pi.PatroniMetricsRestAPIPassword),
		fmt.Sprintf("SUPERADMIN_USER=%s", pi.PlatformAdminUserName),
		fmt.Sprintf("SUPERADMIN_PASSWORD=%s", pi.PlatformAdminPassword),
		fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", pi.GrafanaDatasourcePassword),
		fmt.Sprintf("DATA_RETENTION_INTERVAL=\"%s\"", pi.TimescaleDataRetentionInterval),
		fmt.Sprintf("WALG_LIBSODIUM_KEY=%s", pi.WalgLibsodiumKey),
		fmt.Sprintf("WALG_S3_PREFIX=%s", pi.WalgS3PrefixMetrics),
		fmt.Sprintf("WALG_COMPRESSION_METHOD=%s", pi.WalgCompressionMethod),
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", awsAccessKeyId),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", awsSecretAccessKey),
		fmt.Sprintf("AWS_REGION=%s", awsRegion),
	}
	metricsLines = appendSidecarToken(metricsLines, pi)
	metricsData := strings.Join(metricsLines, "\n")
	metricsHash := utils.GetMD5Hash(metricsData)
	secrets["patroni_metrics"] = pt.Secret{
		Name: fmt.Sprintf("patroni_metrics_%s", metricsHash),
		Data: metricsData,
	}
	return secrets
}

// appendSidecarToken adds patroni_sidecar's API token to a secret's lines
// when the platform has one. entrypoint.sh sources the secret with
// `set -a`, so the line reaches patroni_sidecar's environment as
// PATRONI_SIDECAR_API_TOKEN, the variable it reads at startup.
//
// Left out, not written empty, when the state has no token: an empty
// value and no value mean the same to the sidecar, and leaving the line
// out keeps the secret — and its content-derived name — exactly what it
// was before this setting existed.
func appendSidecarToken(lines []string, pi pt.PlatformInfo) []string {
	if pi.PatroniSidecarAPIToken == "" {
		return lines
	}
	return append(lines, fmt.Sprintf("PATRONI_SIDECAR_API_TOKEN=%s", pi.PatroniSidecarAPIToken))
}