package certrenewer

import (
	"bytes"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// CaCertsType is the domain certs type of certificates issued by a CA
// (not obtained by the platform).
const CaCertsType = "Certs provided by an CA"

// CaCertsMaterial is what a platform with certificates issued by a CA
// keeps of them: the private key, the certificate served (the
// domain's followed by the intermediates: traefik and NATS serve only
// that file, so the clients must get the intermediates from it) and
// the CA's chain.
type CaCertsMaterial struct {
	PrivateKey string
	Cert       string
	Chain      string
	NotAfter   time.Time
}

// ErrNoChain: only the domain's certificate, no CA certificate.
var ErrNoChain = errors.New("no CA certificates: the certificate file has only the domain's certificate and no --ca was given. " +
	"Get the intermediate certificate of the CA (its URL is in the certificate: " +
	"openssl x509 -in <cert> -noout -text | grep \"CA Issuers\"; " +
	"to PEM: openssl x509 -inform DER -in <downloaded> -out intermediate.pem) and pass it with --ca")

// PrepareCaCerts checks the certificates issued by a CA for domain and
// returns what the platform keeps of them. certPEM is the domain's
// certificate, first, possibly followed by the CA's chain; caPEM is
// the chain (may be empty when certPEM carries it). Checks: the key
// matches the certificate, the certificate covers domain and is in its
// validity period, and each certificate of the chain signs the one
// before it.
func PrepareCaCerts(domain string, keyPEM, certPEM, caPEM []byte, now time.Time) (CaCertsMaterial, error) {
	m := CaCertsMaterial{}

	certs, err := parseCertificates(certPEM)
	if err != nil {
		return m, fmt.Errorf("certificate: %w", err)
	}
	if len(certs) == 0 {
		return m, errors.New("certificate: no PEM certificate in it")
	}
	leaf := certs[0]

	chain := certs[1:]
	if len(bytes.TrimSpace(caPEM)) > 0 {
		chain, err = parseCertificates(caPEM)
		if err != nil {
			return m, fmt.Errorf("CA certificates: %w", err)
		}
		if len(chain) == 0 {
			return m, errors.New("CA certificates: no PEM certificate in them")
		}
	}
	if len(chain) == 0 {
		return m, ErrNoChain
	}

	key, err := parsePrivateKey(keyPEM)
	if err != nil {
		return m, fmt.Errorf("private key: %w", err)
	}
	if !samePublicKey(key.Public(), leaf.PublicKey) {
		return m, errors.New("the private key does not match the certificate")
	}

	if domain != "" {
		if err := leaf.VerifyHostname(domain); err != nil {
			return m, fmt.Errorf("the certificate does not cover %s: %w", domain, err)
		}
	}
	if now.Before(leaf.NotBefore) {
		return m, fmt.Errorf("the certificate is not valid until %s", leaf.NotBefore.UTC().Format(time.RFC3339))
	}
	if !now.Before(leaf.NotAfter) {
		return m, fmt.Errorf("the certificate expired on %s", leaf.NotAfter.UTC().Format(time.RFC3339))
	}

	// each certificate signed by the next one
	previous := leaf
	for i, c := range chain {
		if err := previous.CheckSignatureFrom(c); err != nil {
			if i == 0 {
				return m, fmt.Errorf("the first CA certificate (%s) did not issue the certificate: %w", c.Subject.CommonName, err)
			}
			return m, fmt.Errorf("the CA certificates are not in order: %s did not issue %s: %w",
				c.Subject.CommonName, previous.Subject.CommonName, err)
		}
		previous = c
	}

	// served: the domain's certificate and the chain, without a root that
	// signs itself (the clients have it, or it would not be trusted)
	var served, chainOut strings.Builder
	served.Write(pemOf(leaf))
	for _, c := range chain {
		chainOut.Write(pemOf(c))
		if !selfSigned(c) {
			served.Write(pemOf(c))
		}
	}

	m.PrivateKey = string(keyPEM)
	m.Cert = served.String()
	m.Chain = chainOut.String()
	m.NotAfter = leaf.NotAfter
	return m, nil
}

// SetCaCerts puts the certificates issued by a CA in the platform data:
// the type, the material, the paths it was read from, the names of their
// Docker secrets and their expiration.
func SetCaCerts(pd *types.PlatformData, m CaCertsMaterial, keyPath, certPath, caPath string) {
	pd.PlatformInfo.DomainCertsType = CaCertsType
	pd.PlatformInfo.DOMAIN_SSL_PRIVATE_KEY_PATH = keyPath
	pd.PlatformInfo.DOMAIN_SSL_CERT_CRT_PATH = certPath
	pd.PlatformInfo.DOMAIN_SSL_CA_PEM_PATH = caPath
	pd.Certs.DomainCerts.PrivateKey = m.PrivateKey
	pd.Certs.DomainCerts.SslCertCrt = m.Cert
	pd.Certs.DomainCerts.SslCaPem = m.Chain
	SetCertsNamesAndExpirationTime(pd)
}

func parseCertificates(data []byte) ([]*x509.Certificate, error) {
	var certs []*x509.Certificate
	rest := data
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return certs, nil
		}
		if block.Type != "CERTIFICATE" {
			continue
		}
		c, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, err
		}
		certs = append(certs, c)
	}
}

func parsePrivateKey(data []byte) (crypto.Signer, error) {
	rest := data
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return nil, errors.New("no PEM private key in it")
		}
		switch block.Type {
		case "PRIVATE KEY":
			k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
			if err != nil {
				return nil, err
			}
			signer, ok := k.(crypto.Signer)
			if !ok {
				return nil, errors.New("unsupported private key")
			}
			return signer, nil
		case "RSA PRIVATE KEY":
			return x509.ParsePKCS1PrivateKey(block.Bytes)
		case "EC PRIVATE KEY":
			return x509.ParseECPrivateKey(block.Bytes)
		case "ENCRYPTED PRIVATE KEY":
			return nil, errors.New("the private key is encrypted (with a passphrase): decrypt it first, e.g. openssl pkey -in <key> -out <decrypted key>")
		}
	}
}

func samePublicKey(a, b crypto.PublicKey) bool {
	switch k := a.(type) {
	case *rsa.PublicKey:
		return k.Equal(b)
	case *ecdsa.PublicKey:
		return k.Equal(b)
	case ed25519.PublicKey:
		return k.Equal(b)
	}
	return false
}

func selfSigned(c *x509.Certificate) bool {
	return bytes.Equal(c.RawSubject, c.RawIssuer) && c.CheckSignatureFrom(c) == nil
}

func pemOf(c *x509.Certificate) []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: c.Raw})
}
