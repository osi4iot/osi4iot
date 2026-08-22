// Package certrenewer obtains and renews the platform's Let's Encrypt
// certificate (ACME DNS-01 via Route53) and rolls it out to the Docker
// Swarm services that consume it (see internal/dockersvc).
package certrenewer

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/md5"
	"crypto/rand"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"os"
	"time"

	"github.com/go-acme/lego/certificate"
	"github.com/go-acme/lego/lego"
	"github.com/go-acme/lego/providers/dns/route53"
	"github.com/go-acme/lego/registration"

	"system_manager/internal/platform"
)

// SetOrUpdateAcmeCerts obtains a certificate for pd's domain if none is
// held yet, or renews it if it's close to expiry.
func SetOrUpdateAcmeCerts(pd *platform.PlatformData) error {
	// Propagate errors instead of calling os.Exit so the daemon's logger
	// captures them and systemd can report the failure correctly.
	if err := setRoute53EnvVars(pd); err != nil {
		return fmt.Errorf("could not configure Route53 credentials: %w", err)
	}

	caDir := lego.LEDirectoryProduction
	// caDir := lego.LEDirectoryStaging

	acmeUser, err := loadOrCreateAcmeUser(pd, caDir)
	if err != nil {
		return fmt.Errorf("could not initialize ACME user: %w", err)
	}

	cfg := lego.NewConfig(acmeUser)
	cfg.CADirURL = caDir
	client, err := lego.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("could not create lego client: %w", err)
	}

	provider, err := route53.NewDNSProvider()
	if err != nil {
		return fmt.Errorf("could not initialize Route53 DNS provider: %w", err)
	}
	client.Challenge.SetDNS01Provider(provider)

	privateKey := pd.DomainCerts.PrivateKey
	sslCertCrt := pd.DomainCerts.SslCertCrt
	sslCaPem := pd.DomainCerts.SslCaPem

	domainName := pd.PlatformInfo.DomainName
	domains := []string{
		domainName,
		"*." + domainName,
	}

	if privateKey == "" || sslCertCrt == "" || sslCaPem == "" {
		if err := obtainCert(pd, client, domains); err != nil {
			return fmt.Errorf("error obtaining certificate: %w", err)
		}
	} else {
		threshold := 15 * 24 * time.Hour // 15 days
		if err := renewIfNeeded(pd, client, domains, threshold); err != nil {
			return fmt.Errorf("error renewing certificate: %w", err)
		}
	}

	return nil
}

// loadOrCreateAcmeUser loads the ACME user from pd or creates a new one if
// it does not exist, registers it with the ACME server, and persists it
// back into pd.
func loadOrCreateAcmeUser(pd *platform.PlatformData, caDirURL string) (*platform.AcmeUser, error) {
	acmeUser := &pd.DomainCerts.AcmeUser
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

	email := pd.PlatformInfo.PlatformAdminEmail
	u := platform.AcmeUser{Email: email, Key: keyPem}
	cfg := lego.NewConfig(&u)
	cfg.CADirURL = caDirURL
	client, err := lego.NewClient(cfg)
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

	pd.DomainCerts.AcmeUser = u
	return &u, nil
}

// timeToExpiry parses a PEM-encoded certificate and returns the duration
// until it expires.
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

// obtainCert requests a brand-new certificate for domains and stores it
// in pd.
func obtainCert(pd *platform.PlatformData, client *lego.Client, domains []string) error {
	req := certificate.ObtainRequest{Domains: domains, Bundle: true}
	res, err := client.Certificate.Obtain(req)
	if err != nil {
		return fmt.Errorf("error obtaining certificate: %w", err)
	}
	pd.DomainCerts.PrivateKey = string(res.PrivateKey)
	pd.DomainCerts.SslCertCrt = string(res.Certificate)
	pd.DomainCerts.SslCaPem = string(res.IssuerCertificate)
	setCertsNamesAndExpirationTime(pd)

	fmt.Printf("[OK] Generated new certificate for %v\n", domains)
	return nil
}

// renewIfNeeded renews pd's certificate if its remaining lifetime is
// below threshold.
func renewIfNeeded(pd *platform.PlatformData, client *lego.Client, domains []string, threshold time.Duration) error {
	certString := pd.DomainCerts.SslCertCrt
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

		pd.DomainCerts.PrivateKey = string(res.PrivateKey)
		pd.DomainCerts.SslCertCrt = string(res.Certificate)
		pd.DomainCerts.SslCaPem = string(res.IssuerCertificate)
		setCertsNamesAndExpirationTime(pd)
	}
	return nil
}

// setRoute53EnvVars sets the environment variables required by the AWS
// Route53 DNS provider.
func setRoute53EnvVars(pd *platform.PlatformData) error {
	if err := os.Setenv("AWS_ACCESS_KEY_ID", pd.PlatformInfo.AWSAccessKeyIDRoute53); err != nil {
		return fmt.Errorf("error setting AWS_ACCESS_KEY_ID: %w", err)
	}
	if err := os.Setenv("AWS_SECRET_ACCESS_KEY", pd.PlatformInfo.AWSSecretAccessKeyRoute53); err != nil {
		return fmt.Errorf("error setting AWS_SECRET_ACCESS_KEY: %w", err)
	}
	if err := os.Setenv("AWS_REGION", awsRegionsMap[pd.PlatformInfo.AWSRegionRoute53]); err != nil {
		return fmt.Errorf("error setting AWS_REGION: %w", err)
	}
	if err := os.Setenv("AWS_HOSTED_ZONE_ID", pd.PlatformInfo.AWSHostedZoneIdRoute53); err != nil {
		return fmt.Errorf("error setting AWS_HOSTED_ZONE_ID: %w", err)
	}
	return nil
}

// setCertsNamesAndExpirationTime derives the Docker secret names
// (content-hash-based, so a new cert always gets a new secret name) and
// expiration timestamps for pd's domain certificates.
func setCertsNamesAndExpirationTime(pd *platform.PlatformData) {
	keyHash := md5Hash(pd.DomainCerts.PrivateKey)
	pd.DomainCerts.IotPlatformKeyName = fmt.Sprintf("iot_platform_key_%s", keyHash)

	caHash := md5Hash(pd.DomainCerts.SslCaPem)
	pd.DomainCerts.IotPlatformCaName = fmt.Sprintf("iot_platform_ca_%s", caHash)
	pd.DomainCerts.CaPemExpirationTimestamp = certExpirationTimestamp(pd.DomainCerts.SslCaPem)

	certHash := md5Hash(pd.DomainCerts.SslCertCrt)
	pd.DomainCerts.IotPlatformCertName = fmt.Sprintf("iot_platform_cert_%s", certHash)
	pd.DomainCerts.CertCrtExpirationTimestamp = certExpirationTimestamp(pd.DomainCerts.SslCertCrt)
}

func md5Hash(text string) string {
	hasher := md5.New()
	hasher.Write([]byte(text))
	return hex.EncodeToString(hasher.Sum(nil))
}

func certExpirationTimestamp(cert string) int64 {
	block, _ := pem.Decode([]byte(cert))
	if block == nil {
		return -1
	}
	parsedCert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return -1
	}
	return parsedCert.NotAfter.UnixMilli() / 1000
}

var awsRegionsMap = map[string]string{
	"US East (Ohio)":            "us-east-2",
	"US East (N. Virginia)":     "us-east-1",
	"US West (N. California)":   "us-west-1",
	"US West (Oregon)":          "us-west-2",
	"Africa (Cape Town)":        "af-south-1",
	"Asia Pacific (Hong Kong)":  "ap-east-1",
	"Asia Pacific (Hyderabad)":  "ap-south-2",
	"Asia Pacific (Jakarta)":    "ap-southeast-3",
	"Asia Pacific (Malaysia)":   "ap-southeast-5",
	"Asia Pacific (Melbourne)":  "ap-southeast-4",
	"Asia Pacific (Mumbai)":     "ap-south-1",
	"Asia Pacific (Osaka)":      "ap-northeast-3",
	"Asia Pacific (Seoul)":      "ap-northeast-2",
	"Asia Pacific (Singapore)":  "ap-southeast-1",
	"Asia Pacific (Sydney)":     "ap-southeast-2",
	"Asia Pacific (Thailand)":   "ap-southeast-7",
	"Asia Pacific (Tokyo)":      "ap-northeast-1",
	"Canada (Central)":          "ca-central-1",
	"Canada West (Calgary)":     "ca-west-1",
	"Europe (Frankfurt)":        "eu-central-1",
	"Europe (Ireland)":          "eu-west-1",
	"Europe (London)":           "eu-west-2",
	"Europe (Milan)":            "eu-south-1",
	"Europe (Paris)":            "eu-west-3",
	"Europe (Spain)":            "eu-south-2",
	"Europe (Stockholm)":        "eu-north-1",
	"Europe (Zurich)":           "eu-central-2",
	"Israel (Tel Aviv)":         "il-central-1",
	"Middle East (Bahrain)":     "me-south-1",
	"Middle East (UAE)":         "me-central-1",
	"South America (São Paulo)": "sa-east-1",
}
