package utils

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
)

// SetOrUpdateAcmeCerts sets or updates the ACME certificates for the platform
func SetOrUpdateAcmeCerts(platformData *types.PlatformData) error {
	setRoute53EnvVars(platformData)

	caDir := lego.LEDirectoryProduction
	// caDir := lego.LEDirectoryStaging

	acmeUser, err := loadOrCreateAcmeUser(platformData, caDir)
	if err != nil {
		fmt.Printf("could not initialize ACME user: %v", err)
		os.Exit(1)
	}

	config := lego.NewConfig(acmeUser)
	config.CADirURL = caDir
	client, err := lego.NewClient(config)
	if err != nil {
		fmt.Printf("lego client: %v", err)
		os.Exit(1)
	}

	provider, err := route53.NewDNSProvider()
	if err != nil {
		fmt.Printf("Error initializing Route53 provider: %v", err)
		os.Exit(1)
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
		err = ObtainCert(platformData, client, domains)
		if err != nil {
			fmt.Printf("error obtaining certificate: %v", err)
			os.Exit(1)
		}
	} else {
		threshold := 15 * 24 * time.Hour // 15 days
		err = renewIfNeeded(platformData, client, domains, threshold)
		if err != nil {
			fmt.Printf("error renewing certificate: %v", err)
			os.Exit(1)
		}
	}

	return nil
}

// LoadOrCreateAcmeUser loads the ACME user from the platformData or creates a new one if it doesn't exist
// It initializes the ACME client and registers the user with the ACME server
// It uses the Route53 DNS provider for DNS challenges
func loadOrCreateAcmeUser(platformData *types.PlatformData, caDirUrl string) (*types.AcmeUser, error) {
	acmeUser := &platformData.Certs.DomainCerts.AcmeUser
	if acmeUser.Email != "" && acmeUser.Key != nil {
		return acmeUser, nil
	}

	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return nil, err
	}
	keyPem := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})

	email := platformData.PlatformInfo.PlatformAdminEmail
	u := types.AcmeUser{Email: email, Key: keyPem}
	config := lego.NewConfig(&u)
	config.CADirURL = caDirUrl
	client, err := lego.NewClient(config)
	if err != nil {
		return nil, err
	}

	provider, err := route53.NewDNSProvider()
	if err != nil {
		fmt.Printf("Error initializing Route53 provider: %v", err)
		os.Exit(1)
	}
	client.Challenge.SetDNS01Provider(provider)
	reg, err := client.Registration.Register(registration.RegisterOptions{TermsOfServiceAgreed: true})
	if err != nil {
		return nil, err
	}
	u.Registration = reg

	platformData.Certs.DomainCerts.AcmeUser = u
	return &u, nil
}

// timeToExpiry parses a PEM encoded certificate and returns the duration until it expires
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

// ObtainCert generates a new certificate for the given domains and saves it in platformData.Certs.DomainCerts
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

	err = WritePlatformDataToFile(platformData)
	if err != nil {
		return fmt.Errorf("error writing platform data to file: %w", err)
	}

	fmt.Printf("[OK] Generated new certificate for %v\n", domains)
	return nil
}

// RenewIfNeeded checks if the certificate is about to expire and renews it if necessary
// It uses a threshold to determine when to renew the certificate
// The threshold is the time before expiration when the certificate should be renewed
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

		err = WritePlatformDataToFile(platformData)
		if err != nil {
			return fmt.Errorf("error writing platform data to file: %w", err)
		}
	}
	return nil
}

// SetRoute53EnvVars sets the environment variables for AWS Route53 credentials
func setRoute53EnvVars(platformData *types.PlatformData) error {
	awsAccessKeyIDRoute53 := platformData.PlatformInfo.AWSAccessKeyIDRoute53
	if err := os.Setenv("AWS_ACCESS_KEY_ID", awsAccessKeyIDRoute53); err != nil {
		return fmt.Errorf("error setting AWS_ACCESS_KEY_ID: %v", err)
	}

	awsSecretAccessKeyRoute53 := platformData.PlatformInfo.AWSSecretAccessKeyRoute53
	if err := os.Setenv("AWS_SECRET_ACCESS_KEY", awsSecretAccessKeyRoute53); err != nil {
		return fmt.Errorf("error setting AWS_SECRET_ACCESS_KEY: %v", err)
	}
	awsRegionRoute53 := AwsRegionsMap[platformData.PlatformInfo.AWSRegionRoute53]
	if err := os.Setenv("AWS_REGION", awsRegionRoute53); err != nil {
		return fmt.Errorf("error setting AWS_REGION: %v", err)
	}
	awsHostedZoneIdRoute53 := platformData.PlatformInfo.AWSHostedZoneIdRoute53
	if err := os.Setenv("AWS_HOSTED_ZONE_ID", awsHostedZoneIdRoute53); err != nil {
		return fmt.Errorf("error setting AWS_HOSTED_ZONE_ID: %v", err)
	}
	return nil
}

// SetCertsNamesAndExpirationTime sets the names and expiration timestamps for the certificates
func SetCertsNamesAndExpirationTime(platformData *types.PlatformData) {
	keyHash := GetMD5Hash(platformData.Certs.DomainCerts.PrivateKey)
	platformData.Certs.DomainCerts.IotPlatformKeyName = fmt.Sprintf("iot_platform_key_%s", keyHash)

	caHash := GetMD5Hash(platformData.Certs.DomainCerts.SslCaPem)
	platformData.Certs.DomainCerts.IotPlatformCaName = fmt.Sprintf("iot_platform_ca_%s", caHash)
	caExpirationTimestamp := GetCertExpirationTimestamp(platformData.Certs.DomainCerts.SslCaPem)
	platformData.Certs.DomainCerts.CaPemExpirationTimestamp = caExpirationTimestamp

	certHash := GetMD5Hash(platformData.Certs.DomainCerts.SslCertCrt)
	platformData.Certs.DomainCerts.IotPlatformCertName = fmt.Sprintf("iot_platform_cert_%s", certHash)
	certExpirationTimestamp := GetCertExpirationTimestamp(platformData.Certs.DomainCerts.SslCertCrt)
	platformData.Certs.DomainCerts.CertCrtExpirationTimestamp = certExpirationTimestamp
}
