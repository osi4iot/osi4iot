// Package platform holds the plain data types shared between the
// cert-renewal (ACME) logic and the Docker Swarm service/secret-rotation
// logic, so neither of those packages has to import the other just to
// pass this data around.
package platform

import (
	"crypto"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"

	"github.com/go-acme/lego/registration"
)

type PlatformInfo struct {
	DomainName                string
	PlatformAdminEmail        string
	AWSAccessKeyIDRoute53     string
	AWSSecretAccessKeyRoute53 string
	AWSRegionRoute53          string
	AWSHostedZoneIdRoute53    string
	DomainCertsType           string
}

// AcmeUser implements lego's registration.User interface.
type AcmeUser struct {
	Email        string                 `json:"email"`
	Registration *registration.Resource `json:"registration"`
	Key          []byte                 `json:"key_pem"`
}

func (u *AcmeUser) GetEmail() string {
	return u.Email
}

func (u *AcmeUser) GetRegistration() *registration.Resource {
	return u.Registration
}

func (u *AcmeUser) GetPrivateKey() crypto.PrivateKey {
	block, _ := pem.Decode(u.Key)
	key, err := x509.ParseECPrivateKey(block.Bytes)
	if err != nil {
		fmt.Printf("Error parsing private key: %v", err)
		os.Exit(1)
	}
	return key
}

type DomainCerts struct {
	AcmeUser                   AcmeUser `json:"acme_user"`
	PrivateKey                 string   `json:"private_key"`
	IotPlatformKeyName         string   `json:"iot_platform_key_name"`
	SslCaPem                   string   `json:"ssl_ca_pem"`
	IotPlatformCaName          string   `json:"iot_platform_ca_name"`
	SslCertCrt                 string   `json:"ssl_cert_crt"`
	IotPlatformCertName        string   `json:"iot_platform_cert_name"`
	CaPemExpirationTimestamp   int64    `json:"ca_pem_expiration_timestamp"`
	CertCrtExpirationTimestamp int64    `json:"cert_crt_expiration_timestamp"`
}

type PlatformData struct {
	PlatformInfo PlatformInfo `json:"platformInfo"`
	DomainCerts  DomainCerts  `json:"certs"`
}
