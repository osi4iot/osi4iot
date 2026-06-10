package certrenewer

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"time"

	"encoding/pem"
	"fmt"
	"os"

	"github.com/go-acme/lego/certificate"
	"github.com/go-acme/lego/lego"
	"github.com/go-acme/lego/providers/dns/route53"
	"github.com/go-acme/lego/registration"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// SetOrUpdateAcmeCerts sets or updates the ACME certificates for the platform.
func SetOrUpdateAcmeCerts(platformData *types.PlatformData) error {
	// Propagate errors instead of calling os.Exit so the daemon's logger
	// captures them and systemd can report the failure correctly.
	if err := setRoute53EnvVars(platformData); err != nil {
		return fmt.Errorf("could not configure Route53 credentials: %w", err)
	}

	caDir := lego.LEDirectoryProduction
	// caDir := lego.LEDirectoryStaging

	acmeUser, err := loadOrCreateAcmeUser(platformData, caDir)
	if err != nil {
		return fmt.Errorf("could not initialize ACME user: %w", err)
	}

	config := lego.NewConfig(acmeUser)
	config.CADirURL = caDir
	client, err := lego.NewClient(config)
	if err != nil {
		return fmt.Errorf("could not create lego client: %w", err)
	}

	provider, err := route53.NewDNSProvider()
	if err != nil {
		return fmt.Errorf("could not initialize Route53 DNS provider: %w", err)
	}
	client.Challenge.SetDNS01Provider(provider)

	privateKey := platformData.Certs.DomainCerts.PrivateKey
	sslCertCrt := platformData.Certs.DomainCerts.SslCertCrt
	sslCaPem := platformData.Certs.DomainCerts.SslCaPem

	domainName := platformData.PlatformInfo.DomainName
	domains := []string{
		domainName,
		"*." + domainName,
	}

	if privateKey == "" || sslCertCrt == "" || sslCaPem == "" {
		if err := ObtainCert(platformData, client, domains); err != nil {
			return fmt.Errorf("error obtaining certificate: %w", err)
		}
	} else {
		threshold := 15 * 24 * time.Hour // 15 days
		if err := renewIfNeeded(platformData, client, domains, threshold); err != nil {
			return fmt.Errorf("error renewing certificate: %w", err)
		}
	}

	return nil
}

// loadOrCreateAcmeUser loads the ACME user from platformData or creates a new
// one if it does not exist, registers it with the ACME server, and persists it
// back into platformData.
func loadOrCreateAcmeUser(platformData *types.PlatformData, caDirUrl string) (*types.AcmeUser, error) {
	acmeUser := &platformData.Certs.DomainCerts.AcmeUser
	if acmeUser.Email != "" && acmeUser.Key != nil {
		return acmeUser, nil
	}

	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("could not generate ECDSA key: %w", err)
	}
	der, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return nil, fmt.Errorf("could not marshal ECDSA key: %w", err)
	}
	keyPem := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})

	email := platformData.PlatformInfo.PlatformAdminEmail
	u := types.AcmeUser{Email: email, Key: keyPem}
	config := lego.NewConfig(&u)
	config.CADirURL = caDirUrl
	client, err := lego.NewClient(config)
	if err != nil {
		return nil, fmt.Errorf("could not create lego client for registration: %w", err)
	}

	provider, err := route53.NewDNSProvider()
	if err != nil {
		return nil, fmt.Errorf("could not initialize Route53 DNS provider: %w", err)
	}
	client.Challenge.SetDNS01Provider(provider)

	reg, err := client.Registration.Register(registration.RegisterOptions{TermsOfServiceAgreed: true})
	if err != nil {
		return nil, fmt.Errorf("could not register ACME user: %w", err)
	}
	u.Registration = reg

	platformData.Certs.DomainCerts.AcmeUser = u
	return &u, nil
}

// timeToExpiry parses a PEM-encoded certificate and returns the duration until
// it expires.
func timeToExpiry(pemCert []byte) (time.Duration, error) {
	block, _ := pem.Decode(pemCert)
	if block == nil || block.Type != "CERTIFICATE" {
		return 0, fmt.Errorf("not a valid certificate PEM")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return 0, err
	}
	return time.Until(cert.NotAfter), nil
}

// ObtainCert generates a new certificate for the given domains and saves it in
// platformData.Certs.DomainCerts.
func ObtainCert(platformData *types.PlatformData,
	client *lego.Client,
	domains []string,
) error {
	req := certificate.ObtainRequest{Domains: domains, Bundle: true}
	res, err := client.Certificate.Obtain(req)
	if err != nil {
		return fmt.Errorf("error obtaining certificate: %w", err)
	}
	platformData.Certs.DomainCerts.PrivateKey = string(res.PrivateKey)
	platformData.Certs.DomainCerts.SslCertCrt = string(res.Certificate)
	platformData.Certs.DomainCerts.SslCaPem = string(res.IssuerCertificate)
	SetCertsNamesAndExpirationTime(platformData)

	if err := utils.WritePlatformDataToFile(platformData); err != nil {
		return fmt.Errorf("error writing platform data to file: %w", err)
	}

	fmt.Printf("[OK] Generated new certificate for %v\n", domains)
	return nil
}

// renewIfNeeded checks whether the certificate is close to expiry and renews
// it when the remaining lifetime is below the given threshold.
func renewIfNeeded(platformData *types.PlatformData,
	client *lego.Client,
	domains []string,
	threshold time.Duration,
) error {
	certString := platformData.Certs.DomainCerts.SslCertCrt
	if certString == "" {
		return fmt.Errorf("there is no certificate to renew")
	}
	certPem := []byte(certString)
	remaining, err := timeToExpiry(certPem)
	if err != nil {
		return fmt.Errorf("parsing expiration: %w", err)
	}

	fmt.Printf("Certificates for %v → expire in %v\n", domains, remaining.Round(time.Second))
	if remaining < threshold {
		fmt.Printf("Renewing certificates for %v \n", domains)
		certResource := certificate.Resource{Domain: domains[0], Certificate: certPem}
		res, err := client.Certificate.Renew(certResource, true, false)
		if err != nil {
			return fmt.Errorf("error renewing certificate: %w", err)
		}

		platformData.Certs.DomainCerts.PrivateKey = string(res.PrivateKey)
		platformData.Certs.DomainCerts.SslCertCrt = string(res.Certificate)
		platformData.Certs.DomainCerts.SslCaPem = string(res.IssuerCertificate)
		SetCertsNamesAndExpirationTime(platformData)

		if err := utils.WritePlatformDataToFile(platformData); err != nil {
			return fmt.Errorf("error writing platform data to file: %w", err)
		}
	}
	return nil
}

// setRoute53EnvVars sets the environment variables required by the AWS Route53
// DNS provider.
func setRoute53EnvVars(platformData *types.PlatformData) error {
	awsAccessKeyIDRoute53 := platformData.PlatformInfo.AWSAccessKeyIDRoute53
	if err := os.Setenv("AWS_ACCESS_KEY_ID", awsAccessKeyIDRoute53); err != nil {
		return fmt.Errorf("error setting AWS_ACCESS_KEY_ID: %w", err)
	}

	awsSecretAccessKeyRoute53 := platformData.PlatformInfo.AWSSecretAccessKeyRoute53
	if err := os.Setenv("AWS_SECRET_ACCESS_KEY", awsSecretAccessKeyRoute53); err != nil {
		return fmt.Errorf("error setting AWS_SECRET_ACCESS_KEY: %w", err)
	}

	awsRegionRoute53 := utils.AwsRegionsMap[platformData.PlatformInfo.AWSRegionRoute53]
	if err := os.Setenv("AWS_REGION", awsRegionRoute53); err != nil {
		return fmt.Errorf("error setting AWS_REGION: %w", err)
	}

	awsHostedZoneIdRoute53 := platformData.PlatformInfo.AWSHostedZoneIdRoute53
	if err := os.Setenv("AWS_HOSTED_ZONE_ID", awsHostedZoneIdRoute53); err != nil {
		return fmt.Errorf("error setting AWS_HOSTED_ZONE_ID: %w", err)
	}
	return nil
}

// SetCertsNamesAndExpirationTime sets the names and expiration timestamps for
// the domain certificates stored in platformData.
func SetCertsNamesAndExpirationTime(platformData *types.PlatformData) {
	keyHash := utils.GetMD5Hash(platformData.Certs.DomainCerts.PrivateKey)
	platformData.Certs.DomainCerts.IotPlatformKeyName = fmt.Sprintf("iot_platform_key_%s", keyHash)

	caHash := utils.GetMD5Hash(platformData.Certs.DomainCerts.SslCaPem)
	platformData.Certs.DomainCerts.IotPlatformCaName = fmt.Sprintf("iot_platform_ca_%s", caHash)
	caExpirationTimestamp := utils.GetCertExpirationTimestamp(platformData.Certs.DomainCerts.SslCaPem)
	platformData.Certs.DomainCerts.CaPemExpirationTimestamp = caExpirationTimestamp

	certHash := utils.GetMD5Hash(platformData.Certs.DomainCerts.SslCertCrt)
	platformData.Certs.DomainCerts.IotPlatformCertName = fmt.Sprintf("iot_platform_cert_%s", certHash)
	certExpirationTimestamp := utils.GetCertExpirationTimestamp(platformData.Certs.DomainCerts.SslCertCrt)
	platformData.Certs.DomainCerts.CertCrtExpirationTimestamp = certExpirationTimestamp
}