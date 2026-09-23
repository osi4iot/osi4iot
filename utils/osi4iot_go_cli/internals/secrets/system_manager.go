package secrets

import (
	"encoding/json"
	"fmt"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func CreateSystemManagerSecrets(pd *pt.PlatformData) pt.Secret {
	pi := pd.PlatformInfo

	needsCertRenewal := pi.DomainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider"
	lines := []string{}

	lines = append(lines,
		fmt.Sprintf("NATS_NKEY_SEED=%s", pd.Certs.NatsCerts.SystemManagerNKeySeed),
		fmt.Sprintf("DOMAIN_NAME=%s", pi.DomainName),
	)

	awsAccessKeyId := pi.PlatformAdminUserName
	awsSecretAccessKey := pi.PlatformAdminPassword
	awsRegion := "us-east-1"
	awsEndpoint := "http://minio:9000/"
	if pi.S3BucketType == "Cloud AWS S3" {
		awsAccessKeyId = pi.AWSAccessKeyIDS3Bucket
		awsSecretAccessKey = pi.AWSSecretAccessKeyS3Bucket
		awsRegion = utils.AwsRegionsMap[pi.AWSRegionS3Bucket]
		awsEndpoint = ""
	}
	lines = append(lines,
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", awsAccessKeyId),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", awsSecretAccessKey),
		fmt.Sprintf("AWS_REGION=%s", awsRegion),
		fmt.Sprintf("AWS_ENDPOINT=%s", awsEndpoint),
	)

	if needsCertRenewal {
		// PLATFORM_ENCRYPTION_KEY is the platform's master key.
		// system_manager derives its own subkey from it (see
		// certstore.DeriveSubkey) to encrypt the certificate material in
		// its volume and to decrypt the initial certificates shipped in
		// the separate system_manager_certs secret — see
		// CreateSystemManagerCertsSecret. Generated once at platform
		// creation and never rotated: see
		// PlatformInfo.PlatformEncryptionKey.
		lines = append(lines,
			fmt.Sprintf("PLATFORM_ADMIN_EMAIL=%s", pi.PlatformAdminEmail),
			fmt.Sprintf("AWS_ACCESS_KEY_ID_ROUTE53=%s", pi.AWSAccessKeyIDRoute53),
			fmt.Sprintf("AWS_SECRET_ACCESS_KEY_ROUTE53=%s", pi.AWSSecretAccessKeyRoute53),
			fmt.Sprintf("AWS_REGION_ROUTE53=%s", utils.ShellQuote(pi.AWSRegionRoute53)),
			fmt.Sprintf("AWS_HOSTED_ZONE_ID_ROUTE53=%s", pi.AWSHostedZoneIdRoute53),
			fmt.Sprintf("PLATFORM_ENCRYPTION_KEY=%s", pi.PlatformEncryptionKey),
		)
	}

	data := strings.Join(lines, "\n")
	hash := utils.GetMD5Hash(data)
	secret := pt.Secret{
		Name: fmt.Sprintf("system_manager_%s", hash),
		Data: data,
	}
	return secret
}

// CreateSystemManagerCertsSecret packages the certificates this CLI
// issued as an encrypted blob for system_manager to seed its volume
// with.
//
// Without it, a freshly created platform leaves /data/certrenewer empty
// until the first renewal actually fires, so system_manager's first
// expiry check has nothing to check and would go straight to ACME for a
// certificate the CLI obtained minutes earlier.
//
// It is deliberately a SEPARATE secret from system_manager_*, not
// another line in it:
//
//   - that one is sourced by entrypoint.sh as a shell env file, and PEM
//     material is multi-line;
//   - its name is a hash of its contents, so folding certificates into
//     it would rename the secret — and therefore restart system_manager
//     — on every renewal, which is exactly what moving renewal out of
//     the CLI was meant to stop.
//
// system_manager only writes this into its volume when the volume holds
// nothing fresher (see its certstore.Store.Seed), so a day-one seed
// still sitting in the swarm after a year of renewals is harmless.
func CreateSystemManagerCertsSecret(pd *pt.PlatformData) (pt.Secret, error) {
	// The JSON here is unmarshalled on the other side into
	// system_manager's platform.DomainCerts, so the two structs' json
	// tags have to agree field for field. They do today; if
	// pt.DomainCerts grows or renames a tag, platform.DomainCerts has to
	// follow.
	plain, err := json.Marshal(pd.Certs.DomainCerts)
	if err != nil {
		return pt.Secret{}, fmt.Errorf("error encoding domain certs: %w", err)
	}

	blob, err := utils.EncryptWithPlatformKey(pd.PlatformInfo.PlatformEncryptionKey, utils.PurposeDomainCerts, plain)
	if err != nil {
		return pt.Secret{}, fmt.Errorf("error encrypting domain certs: %w", err)
	}

	// The name is hashed from the PLAINTEXT, not from blob: GCM uses a
	// fresh random nonce every time, so hashing the ciphertext would
	// give a different secret name on every CLI invocation and roll the
	// service for no reason.
	hash := utils.GetMD5Hash(string(plain))
	return pt.Secret{
		Name: fmt.Sprintf("system_manager_certs_%s", hash),
		Data: blob,
	}, nil
}
