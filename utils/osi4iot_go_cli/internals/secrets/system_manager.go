package secrets

import (
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
		awsRegion = pi.AWSRegionS3Bucket
		awsEndpoint = ""
	}
	lines = append(lines,
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", awsAccessKeyId),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", awsSecretAccessKey),
		fmt.Sprintf("AWS_REGION=%s", awsRegion),
		fmt.Sprintf("AWS_ENDPOINT=%s", awsEndpoint),
	)

	if needsCertRenewal {
		lines = append(lines,
			fmt.Sprintf("PLATFORM_ADMIN_EMAIL=%s", pi.PlatformAdminEmail),
			fmt.Sprintf("AWS_ACCESS_KEY_ID_ROUTE53=%s", pi.AWSAccessKeyIDRoute53),
			fmt.Sprintf("AWS_SECRET_ACCESS_KEY_ROUTE53=%s", pi.AWSSecretAccessKeyRoute53),
			fmt.Sprintf("AWS_REGION_ROUTE53=%s", utils.ShellQuote(pi.AWSRegionRoute53)),
			fmt.Sprintf("AWS_HOSTED_ZONE_ID_ROUTE53=%s", pi.AWSHostedZoneIdRoute53),
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
