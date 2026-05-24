package utils

import (
	"crypto/md5"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/nats-io/nkeys"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

type CertExpirationInfo struct {
	ExpirationTime      string
	DaysToExpiry        int64
}

func GetMD5Hash(text string) string {
	hasher := md5.New()
	hasher.Write([]byte(text))
	return hex.EncodeToString(hasher.Sum(nil))
}

func GetCertExpirationTimestamp(cert string) int64 {
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


func NatsCredentials(platformData *types.PlatformData) error {
    platformData.Certs.NatsCerts.NatsAdminUsername = "nats_admin"
    natsAdminPassword := GeneratePassword(20)
    platformData.Certs.NatsCerts.NatsAdminPassword = natsAdminPassword
    var err error
    platformData.Certs.NatsCerts.NatsAdminHashedPassword, err = HashNasPassword(natsAdminPassword)
    if err != nil {
        return err
    }

    // Issuer account keypair
    accountKP, err := nkeys.CreateAccount()
    if err != nil {
        return err
    }
    accountPub, err := accountKP.PublicKey()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.NatsIssuerPublicKey = accountPub
    accountSeed, err := accountKP.Seed()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.NatsIssuerSeed = string(accountSeed)

    // XKey
    xkeyKP, err := nkeys.CreateCurveKeys()
    if err != nil {
        return err
    }
    xkeyPub, err := xkeyKP.PublicKey()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.NatsXKeyPublicKey = xkeyPub
    xkeySeed, err := xkeyKP.Seed()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.NatsXKeySeed = string(xkeySeed)

    // NATS admin NKey
    natsAdminKP, err := nkeys.CreateUser()
    if err != nil {
        return err
    }
    natsAdminNkeyPub, err := natsAdminKP.PublicKey()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.NatsAdminNkeyPublic = natsAdminNkeyPub
    natsAdminNkeySeed, err := natsAdminKP.Seed()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.NatsAdminNkeySeed = string(natsAdminNkeySeed)

    // Platform admin NKey
    userPub, userSeed, err := CreateUserNatsNkey()
    if err != nil {
        return err
    }
    platformData.PlatformInfo.PlatformAdminNatsPublicKey = userPub
    platformData.PlatformInfo.PlatformAdminNatsSeed = userSeed

    // Infra services NKeys
    vectorPub, vectorSeed, err := CreateUserNatsNkey()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.VectorNKeyPublic = vectorPub
    platformData.Certs.NatsCerts.VectorNKeySeed = vectorSeed

    adminApiPub, adminApiSeed, err := CreateUserNatsNkey()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.AdminApiNKeyPublic = adminApiPub
    platformData.Certs.NatsCerts.AdminApiNKeySeed = adminApiSeed

    pipelinesPub, pipelinesSeed, err := CreateUserNatsNkey()
    if err != nil {
        return err
    }
    platformData.Certs.NatsCerts.PipelinesNKeyPublic = pipelinesPub
    platformData.Certs.NatsCerts.PipelinesNKeySeed = pipelinesSeed

    return nil
}

func HashNasPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func CreateUserNatsNkey() (string, string, error) {
	userKP, err := nkeys.CreateUser()
	if err != nil {
		return "", "", err
	}
	userPub, err := userKP.PublicKey()
	if err != nil {
		return "", "", err
	}
	userSeed, err := userKP.Seed()
	if err != nil {
		return "", "", err
	}
	return userPub, string(userSeed), nil
}

func GetCertsExpirationInfo(pd *types.PlatformData) (CertExpirationInfo, error) {
	caPemExpirationTimestamp := pd.Certs.DomainCerts.CaPemExpirationTimestamp
	CertCrtExpirationTimestamp := pd.Certs.DomainCerts.CertCrtExpirationTimestamp
	if caPemExpirationTimestamp == 0 || CertCrtExpirationTimestamp == 0 {
		return CertExpirationInfo{}, fmt.Errorf("certificate expiration timestamps are not set")
	}

	expirationTimestamp := Min(caPemExpirationTimestamp, CertCrtExpirationTimestamp)

	currentTimestamp := time.Now().Unix()
	daysToExpiry := (expirationTimestamp - currentTimestamp) / (24 * 3600)

	expirationInfo := CertExpirationInfo{
		ExpirationTime: time.Unix(expirationTimestamp, 0).Format(time.RFC850),
		DaysToExpiry:   daysToExpiry,
	}

	return expirationInfo, nil
}

