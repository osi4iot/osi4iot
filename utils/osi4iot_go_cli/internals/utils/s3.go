package utils

import (
	"fmt"
	"strings"

	osi_types "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// This file is the single place that answers, for every S3 client in the
// platform: which object store, which endpoint, which region and which
// credentials. Nothing else should hardcode any of the four — that is
// how admin_api ended up signing for eu-west-3, pipelines for a
// human-readable label and everyone else for us-east-1.

// S3 bucket types, as stored in PlatformInfo.S3BucketType.
const (
	// S3BucketTypeGarage is the platform's own object store: a Garage
	// service on the swarm.
	S3BucketTypeGarage = "Local Garage"
	// S3BucketTypeAWS is an external AWS S3 bucket.
	S3BucketTypeAWS = "Cloud AWS S3"
)

// S3BucketTypes are the choices the platform form offers.
var S3BucketTypes = []string{S3BucketTypeGarage, S3BucketTypeAWS}

// Garage service coordinates. The service is reachable by name on
// internal_net.
const (
	GarageServiceName = "garage"
	GarageS3Port      = 3900
	GarageRPCPort     = 3901
	GarageAdminPort   = 3903
	// GarageS3Endpoint is the S3 API as every platform service sees it.
	GarageS3Endpoint = "http://garage:3900"
	// DefaultGarageImage is the image GarageService runs, and the one
	// the CLI's helper containers (rclone) and recovery container use.
	// Garage v2.4.1, second revision of the osi4iot image: the entrypoint
	// installs the instance's identity and the provisioning spec carries
	// the first layout's nodes. A new tag rather than v2.4.1 again, so no
	// node runs a cached earlier image that would refuse the new spec.
	DefaultGarageImage = "ghcr.io/osi4iot/garage:v2.4.1-2"
)

// GarageS3Region is the ONE region of the platform's Garage. It is
// configured as s3_region in garage.toml and handed to every client:
// Garage checks the region in the SigV4 credential scope and rejects a
// request signed for any other one.
const GarageS3Region = "us-east-1"

// S3Consumer identifies one client of the object store. With Garage each
// one gets its own access key, so a leaked key can be revoked — and is
// visible in Garage's logs — without touching the others.
type S3Consumer string

const (
	S3ConsumerWalgAdmin     S3Consumer = "walg-admin"
	S3ConsumerWalgMetrics   S3Consumer = "walg-metrics"
	S3ConsumerPipelines     S3Consumer = "pipelines"
	S3ConsumerAdminAPI      S3Consumer = "admin-api"
	S3ConsumerSystemManager S3Consumer = "system-manager"
	// S3ConsumerCLI is the osi4iot CLI itself: snapshots, seeding a new
	// platform from one, the bucket check after a deploy.
	S3ConsumerCLI S3Consumer = "cli"
)

// S3Consumers lists every consumer, in a fixed order (the provisioning
// spec, and therefore the secret's hash, must not depend on map order).
var S3Consumers = []S3Consumer{
	S3ConsumerWalgAdmin,
	S3ConsumerWalgMetrics,
	S3ConsumerPipelines,
	S3ConsumerAdminAPI,
	S3ConsumerSystemManager,
	S3ConsumerCLI,
}

// GarageBucketPermissions is what each key may do on the platform's
// bucket, in garage-provision's notation (r read, w write, o owner).
//
// Everyone gets read+write on the ONE bucket and nothing else: the
// platform keeps a single bucket — with prefixes for WAL-G, NATS, the
// state file and org_data — so that Garage and AWS S3 deployments have
// the same layout, and Garage permissions are per bucket. What is
// withheld is everything a data-plane client has no business doing:
// "owner" (delete the bucket, change its website/CORS/lifecycle
// configuration) and creating buckets. Bucket creation belongs to the
// provisioning alone.
func GarageBucketPermissions(c S3Consumer) string {
	return "rw"
}

// IsGarage reports whether the platform runs its own Garage.
func IsGarage(pi osi_types.PlatformInfo) bool {
	return pi.S3BucketType == S3BucketTypeGarage
}

// IsAwsS3 reports whether the platform uses an external AWS S3 bucket.
func IsAwsS3(pi osi_types.PlatformInfo) bool {
	return pi.S3BucketType == S3BucketTypeAWS
}

// CheckS3BucketType refuses a state file whose object store this CLI
// does not know how to deploy, before anything is built from it.
func CheckS3BucketType(pi osi_types.PlatformInfo) error {
	switch pi.S3BucketType {
	case S3BucketTypeGarage, S3BucketTypeAWS:
		return nil
	case "":
		return fmt.Errorf("the state file has no S3 bucket type")
	default:
		return fmt.Errorf("unknown S3 bucket type %q (expected %q or %q)",
			pi.S3BucketType, S3BucketTypeGarage, S3BucketTypeAWS)
	}
}

// S3Region is the region every S3 client of this platform must sign for.
//
// Garage: always GarageS3Region. AWS: the bucket's region, as a code —
// the form stores a human-readable label — and us-east-1 when there is
// none, which is also the SDKs' own default. Forcing us-east-1 on a real
// AWS bucket elsewhere would be wrong: S3 rejects requests signed for
// another region than the bucket's.
func S3Region(pi osi_types.PlatformInfo) string {
	if IsGarage(pi) {
		return GarageS3Region
	}
	if region := AwsRegionCode(pi.AWSRegionS3Bucket); region != "" {
		return region
	}
	return GarageS3Region
}

// S3Endpoint is the endpoint platform services use, or "" for real AWS
// (each SDK then builds the regional endpoint itself). A non-empty
// endpoint always goes with path-style addressing: Garage is reached by
// a bare service name, with no virtual-host DNS.
func S3Endpoint(pi osi_types.PlatformInfo) string {
	if IsGarage(pi) {
		return GarageS3Endpoint
	}
	return ""
}

// S3KeyOf returns where a consumer's Garage key lives in the state.
func S3KeyOf(pi *osi_types.PlatformInfo, c S3Consumer) *osi_types.S3Credentials {
	switch c {
	case S3ConsumerWalgAdmin:
		return &pi.S3KeyWalgAdmin
	case S3ConsumerWalgMetrics:
		return &pi.S3KeyWalgMetrics
	case S3ConsumerPipelines:
		return &pi.S3KeyPipelines
	case S3ConsumerAdminAPI:
		return &pi.S3KeyAdminAPI
	case S3ConsumerSystemManager:
		return &pi.S3KeySystemManager
	case S3ConsumerCLI:
		return &pi.S3KeyCLI
	}
	panic(fmt.Sprintf("utils.S3KeyOf: unknown S3 consumer %q", c))
}

// S3CredentialsFor returns the credentials a consumer authenticates with:
// its own Garage key, or with AWS the bucket's credentials from the form
// (AWS has its own IAM; the platform does not manage users there).
func S3CredentialsFor(pi osi_types.PlatformInfo, c S3Consumer) osi_types.S3Credentials {
	if IsGarage(pi) {
		return *S3KeyOf(&pi, c)
	}
	return osi_types.S3Credentials{
		AccessKeyID:     pi.AWSAccessKeyIDS3Bucket,
		SecretAccessKey: pi.AWSSecretAccessKeyS3Bucket,
	}
}

// GenerateGarageAccessKeyID returns a new access key ID in Garage's own
// format: "GK" followed by 12 random bytes in hex (26 characters), the
// same shape `garage key create` produces, so imported keys are
// indistinguishable from native ones.
func GenerateGarageAccessKeyID() string {
	return "GK" + GenerateHexKey(12)
}

// GenerateGarageSecretAccessKey returns 32 random bytes in hex, which is
// also what Garage generates itself.
func GenerateGarageSecretAccessKey() string {
	return GenerateHexKey(32)
}

// EnsureGarageSecrets fills in every Garage secret that is missing —
// RPC secret, admin and metrics tokens, one S3 key per consumer — or,
// with force, replaces all of them. Returns whether anything changed, so
// a caller holding a state file knows to save it.
//
// Does nothing for an AWS platform.
//
// Rotating is safe: garage-provision re-imports a key whose secret
// changed and deletes the keys it manages that are no longer wanted, and
// every consumer receives its new key through a secret whose name is a
// hash of its content, so Swarm restarts it with the new value.
func EnsureGarageSecrets(pi *osi_types.PlatformInfo, force bool) bool {
	if !IsGarage(*pi) {
		return false
	}
	changed := false
	fill := func(field *string, generate func() string) {
		if force || *field == "" {
			*field = generate()
			changed = true
		}
	}
	key := func() string { return GenerateHexKey(32) }

	// rpc_secret must be exactly 32 bytes, hex encoded.
	fill(&pi.GarageRPCSecret, key)
	fill(&pi.GarageAdminToken, key)
	fill(&pi.GarageMetricsToken, key)

	for _, c := range S3Consumers {
		creds := S3KeyOf(pi, c)
		// Both halves together: a key ID with a fresh secret, or the
		// other way round, is just a different key.
		if force || creds.AccessKeyID == "" || creds.SecretAccessKey == "" {
			creds.AccessKeyID = GenerateGarageAccessKeyID()
			creds.SecretAccessKey = GenerateGarageSecretAccessKey()
			changed = true
		}
	}
	return changed
}

// quotedList renders TOML string array items.
func quotedList(items []string) string {
	quoted := make([]string, 0, len(items))
	for _, item := range items {
		quoted = append(quoted, `"`+item+`"`)
	}
	return strings.Join(quoted, ", ")
}

// GarageConfigToml renders garage.toml. It holds the RPC secret and the
// admin tokens, so it travels as a Swarm secret, never as a config.
func GarageConfigToml(pi osi_types.PlatformInfo) string {
	lines := []string{
		`metadata_dir = "/var/lib/garage/meta"`,
		`data_dir = "/var/lib/garage/data"`,
		`db_engine = "lmdb"`,
		// A consistent copy of the metadata db, so a crash in the
		// middle of a write never means rebuilding it from scratch.
		`metadata_auto_snapshot_interval = "6h"`,
		``,
		// Fixed at creation: 1 for a local deployment, 3 for a cluster
		// (see garage_cluster.go). Must be the same on every instance.
		fmt.Sprintf(`replication_factor = %d`, GarageReplicationFactor(pi)),
		`consistency_mode = "consistent"`,
		``,
		// IPv4 wildcard rather than "[::]": Docker containers often run
		// with IPv6 disabled, and then binding "::" fails outright.
		fmt.Sprintf(`rpc_bind_addr = "0.0.0.0:%d"`, GarageRPCPort),
		fmt.Sprintf(`rpc_secret = "%s"`, pi.GarageRPCSecret),
		// Every instance, by node ID and service name: the IDs are
		// generated by the CLI, so the full list is known up front. One
		// shared file for all instances — each skips its own entry.
		"bootstrap_peers = [" + quotedList(GarageBootstrapPeers(pi)) + "]",
		``,
		`[s3_api]`,
		fmt.Sprintf(`s3_region = "%s"`, GarageS3Region),
		fmt.Sprintf(`api_bind_addr = "0.0.0.0:%d"`, GarageS3Port),
		``,
		`[admin]`,
		fmt.Sprintf(`api_bind_addr = "0.0.0.0:%d"`, GarageAdminPort),
		fmt.Sprintf(`admin_token = "%s"`, pi.GarageAdminToken),
		fmt.Sprintf(`metrics_token = "%s"`, pi.GarageMetricsToken),
	}
	return strings.Join(lines, "\n") + "\n"
}

// GarageProvisionSpec renders the input of garage-provision (see the
// garage image), which runs on the primary instance only: the bucket,
// every node of the first layout with its zone and capacity, and every
// key with its permissions on the bucket.
//
// The node lines are only used on a cluster that has no layout yet.
// After that the layout belongs to the CLI (scaling, rebalancing).
func GarageProvisionSpec(pi osi_types.PlatformInfo) string {
	lines := []string{
		"bucket " + pi.S3BucketName,
	}
	for _, inst := range GarageInstancesSorted(pi) {
		lines = append(lines, fmt.Sprintf("node %s %s %d",
			GarageNodeID(inst), GarageZone(pi, inst.NodeIP), GarageNodeCapacity))
	}
	for _, c := range S3Consumers {
		creds := S3KeyOf(&pi, c)
		lines = append(lines, fmt.Sprintf("key %s %s %s %s",
			c, creds.AccessKeyID, creds.SecretAccessKey, GarageBucketPermissions(c)))
	}
	return strings.Join(lines, "\n") + "\n"
}
