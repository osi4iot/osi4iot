package data

import (
	"crypto/md5"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"strings"
	"time"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

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

func CreateCaCerts() (*rsa.PrivateKey, *x509.Certificate, error) {
	var caKey *rsa.PrivateKey
	var caCert *x509.Certificate
	var err error
	loadedCaCrt := Data.Certs.MqttCerts.CaCerts.CaCrt
	loadedCaKey := Data.Certs.MqttCerts.CaCerts.CaKey
	loadedExpirationTimestamp := Data.Certs.MqttCerts.CaCerts.ExpirationTimestamp
	expirationTime := time.Unix(loadedExpirationTimestamp, 0)
	limitTime := time.Now().Add(24 * 15 * time.Hour) //15 day of margin
	if (loadedCaCrt == "" && loadedCaKey == "") || expirationTime.Before(limitTime) {
		mainOrgName := Data.PlatformInfo.MainOrganizationName
		domainName := Data.PlatformInfo.DomainName
		caKey, err = rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return nil, nil, fmt.Errorf("error generating CA private key: %v", err)
		}

		serialNumber, err := rand.Int(rand.Reader, big.NewInt(1<<62))
		if err != nil {
			return nil, nil, fmt.Errorf("error generating serial number for CA: %v", err)
		}
		caCert = &x509.Certificate{
			SerialNumber: serialNumber,
			Subject: pkix.Name{
				CommonName:   domainName,
				Organization: []string{mainOrgName},
			},
			NotBefore:             time.Now(),
			NotAfter:              time.Now().Add(100 * 365 * 24 * time.Hour), // 100 years
			KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
			BasicConstraintsValid: true,
			IsCA:                  true,
			MaxPathLen:            0,
			MaxPathLenZero:        true,
		}

		caDERBytes, err := x509.CreateCertificate(
			rand.Reader,
			caCert,
			caCert,
			&caKey.PublicKey,
			caKey,
		)
		if err != nil {
			return nil, nil, fmt.Errorf("error creating CA certificate: %v", err)
		}

		caKeyPEM := pem.EncodeToMemory(&pem.Block{
			Type:  "RSA PRIVATE KEY",
			Bytes: x509.MarshalPKCS1PrivateKey(caKey),
		})

		caKeyString := string(caKeyPEM)
		Data.Certs.MqttCerts.CaCerts.CaKey = caKeyString
		mqttCertsCaKeyName := fmt.Sprintf("mqtt_certs_ca_cert_%s.pem", GetMD5Hash(caKeyString))
		Data.Certs.MqttCerts.CaCerts.MqttCertsCaKeyName = mqttCertsCaKeyName

		caCertPEM := pem.EncodeToMemory(&pem.Block{
			Type:  "CERTIFICATE",
			Bytes: caDERBytes,
		})

		caCertString := string(caCertPEM)
		Data.Certs.MqttCerts.CaCerts.CaCrt = caCertString
		mqttCertsCaCertName := fmt.Sprintf("mqtt_certs_ca_cert_%s.pem", GetMD5Hash(caCertString))
		Data.Certs.MqttCerts.CaCerts.MqttCertsCaCertName = mqttCertsCaCertName
		Data.Certs.MqttCerts.CaCerts.ExpirationTimestamp = GetCertExpirationTimestamp(caCertString)

		deploymentMode := Data.PlatformInfo.DeploymentMode
		if deploymentMode == "development" {
			utils.WriteToFile("./certs/mqtt_certs/ca.cert", caCertPEM, 0600)
			utils.WriteToFile("./certs/mqtt_certs/ca.key", caKeyPEM, 0600)
		}
	} else {
		caCertPEM := []byte(Data.Certs.MqttCerts.CaCerts.CaCrt)
		block, _ := pem.Decode(caCertPEM)
		if block == nil || block.Type != "CERTIFICATE" {
			return nil, nil, fmt.Errorf("CA certificate could not be decoded")
		}
		caCert, err = x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, nil, fmt.Errorf("error parsing CA certificate:: %v", err)
		}
		
		caKeyPEM := []byte(Data.Certs.MqttCerts.CaCerts.CaKey)
		block, _ = pem.Decode(caKeyPEM)
		if block == nil || block.Type != "RSA PRIVATE KEY" {
			return nil, nil, fmt.Errorf("failed to decode CA private key")
		}
		caKey, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, nil, fmt.Errorf("error parsing CA private key: %v", err)
		}
	}

	return caKey, caCert, nil
}

func CreateBrokerCerts(caKey *rsa.PrivateKey, caCert *x509.Certificate) error {
	var mqttCert, mqttKey string
	commonName := "mqtt_broker"
	validityDays := 3650 //10 years
	loadedServerCrt := Data.Certs.MqttCerts.Broker.ServerCrt
	loadedServerKey := Data.Certs.MqttCerts.Broker.ServerKey
	loadedExpirationTimestamp := Data.Certs.MqttCerts.Broker.ExpirationTimestamp
	expirationTime := time.Unix(loadedExpirationTimestamp, 0)
	limitTime := time.Now().Add(24 * 15 * time.Hour) //15 days of margin
	if (loadedServerCrt == "" && loadedServerKey == "") || expirationTime.Before(limitTime) {
		domainName := Data.PlatformInfo.DomainName
		serverKey, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return fmt.Errorf("error generating broker private key: %v", err)
		}

		serialNumber, err := rand.Int(rand.Reader, big.NewInt(1<<62))
		if err != nil {
			return fmt.Errorf("error generating serial number for client %s: %v", commonName, err)
		}
		timeInHours := time.Duration(validityDays) * 24 * time.Hour

		serverTemplate := x509.Certificate{
			SerialNumber: serialNumber,
			Subject: pkix.Name{
				CommonName: commonName,
			},
			NotBefore: time.Now(),
			NotAfter:  time.Now().Add(timeInHours),
			KeyUsage:  x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
			ExtKeyUsage: []x509.ExtKeyUsage{
				x509.ExtKeyUsageServerAuth,
			},
			BasicConstraintsValid: true,
			IPAddresses:           []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback},
			DNSNames:              []string{"localhost", domainName}, // SAN
		}
		serverDERBytes, err := x509.CreateCertificate(
			rand.Reader,
			&serverTemplate,
			caCert,
			&serverKey.PublicKey,
			caKey,
		)
		if err != nil {
			return fmt.Errorf("error creating broker certificate: %v", err)
		}

		serverCertPEM := pem.EncodeToMemory(&pem.Block{
			Type:  "CERTIFICATE",
			Bytes: serverDERBytes,
		})

		serverKeyPEM := pem.EncodeToMemory(&pem.Block{
			Type:  "RSA PRIVATE KEY",
			Bytes: x509.MarshalPKCS1PrivateKey(serverKey),
		})

		mqttCert = string(serverCertPEM)
		Data.Certs.MqttCerts.Broker.ServerCrt = mqttCert
		mqttBrokerCertName := fmt.Sprintf("mqtt_broker_cert_%s", GetMD5Hash(mqttCert))
		Data.Certs.MqttCerts.Broker.MqttBrokerCertName = mqttBrokerCertName
		Data.Certs.MqttCerts.Broker.ExpirationTimestamp = GetCertExpirationTimestamp(mqttCert)

		mqttKey = string(serverKeyPEM)
		Data.Certs.MqttCerts.Broker.ServerKey = mqttKey
		mqttBrokerKeyName := fmt.Sprintf("mqtt_broker_key_%s", GetMD5Hash(mqttKey))
		Data.Certs.MqttCerts.Broker.MqttBrokerKeyName = mqttBrokerKeyName

		deploymentMode := Data.PlatformInfo.DeploymentMode
		if deploymentMode == "development" {
			utils.WriteToFile("./certs/mqtt_certs/server.cert", serverCertPEM, 0600)
			utils.WriteToFile("./certs/mqtt_certs/server.key", serverKeyPEM, 0600)
		}
	}

	return nil
}

func CreateNodeRedCerts(caKey *rsa.PrivateKey, caCert *x509.Certificate) error {
	domainName := Data.PlatformInfo.DomainName
	validityDays := Data.PlatformInfo.MQTTSslCertsValidityDays
	limitTime := time.Now().Add(24 * 15 * time.Hour) //15 days of margin
	deploymentMode := Data.PlatformInfo.DeploymentMode
	for iorg, org := range Data.Certs.MqttCerts.Organizations {
		orgAcronym := org.OrgAcronym
		orgAcronymLower := strings.ToLower(orgAcronym)
		for inri, nri := range org.NodeRedInstances {
			mqttClientCert := nri.ClientCrt
			mqttClientKey := nri.ClientKey
			mqttClientExpirationTimestamp := nri.ExpirationTimestamp
			expirationTime := time.Unix(mqttClientExpirationTimestamp, 0)
			if (mqttClientCert == "" && mqttClientKey == "") || expirationTime.Before(limitTime) {
				nriHash := nri.NriHash
				if nriHash == "" {
					nriHash = utils.GeneratePassword(10)
				}
				nriCommonName := fmt.Sprintf("nri_%s", nriHash)

				serverKey, err := rsa.GenerateKey(rand.Reader, 2048)
				if err != nil {
					return fmt.Errorf("error generating node-red private key: %v", err)
				}

				serialNumber, err := rand.Int(rand.Reader, big.NewInt(1<<62))
				if err != nil {
					return fmt.Errorf("error generating serial number for client %s: %v", nriCommonName, err)
				}
				timeInHours := time.Duration(validityDays) * 24 * time.Hour

				serverTemplate := x509.Certificate{
					SerialNumber: serialNumber,
					Subject: pkix.Name{
						CommonName: nriCommonName,
					},
					NotBefore: time.Now(),
					NotAfter:  time.Now().Add(timeInHours),
					KeyUsage:  x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
					ExtKeyUsage: []x509.ExtKeyUsage{
						x509.ExtKeyUsageClientAuth,
					},
					BasicConstraintsValid: true,
					IPAddresses:           []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback},
					DNSNames:              []string{"localhost", domainName}, // SAN
				}

				nriDERBytes, err := x509.CreateCertificate(
					rand.Reader,
					&serverTemplate,
					caCert,
					&serverKey.PublicKey,
					caKey,
				)
				if err != nil {
					return fmt.Errorf("error creating client cert: %v", err)
				}

				nriCertPEM := pem.EncodeToMemory(&pem.Block{
					Type:  "CERTIFICATE",
					Bytes: nriDERBytes,
				})

				nriKeyPEM := pem.EncodeToMemory(&pem.Block{
					Type:  "RSA PRIVATE KEY",
					Bytes: x509.MarshalPKCS1PrivateKey(serverKey),
				})

				mqttClientCert := string(nriCertPEM)
				mqttClientKey := string(nriKeyPEM)

				Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientCrt = mqttClientCert
				mqttClientCertName := fmt.Sprintf("%s_%s_cert_%s", orgAcronymLower, nriHash, GetMD5Hash(mqttClientCert))
				Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientCrtName = mqttClientCertName
				Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ExpirationTimestamp = GetCertExpirationTimestamp(mqttClientCert)

				Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientKey = mqttClientKey
				mqttClientKeyName := fmt.Sprintf("%s_%s_key_%s", orgAcronymLower, nriHash, GetMD5Hash(mqttClientKey))
				Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientKeyName = mqttClientKeyName
				Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].IsVolumeCreated = "false"
				Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].NriHash = nriHash

				if deploymentMode == "development" {
					utils.WriteToFile(fmt.Sprintf("./certs/mqtt_certs/%s.crt", nriCommonName), nriCertPEM, 0600)
					utils.WriteToFile(fmt.Sprintf("./certs/mqtt_certs/%s.key", nriCommonName), nriKeyPEM, 0600)
				}
			}
		}
	}

	return nil
}

func MqttTLSCredentials() error {
	//CA Cert
	caKey, caCert, err := CreateCaCerts()
	if err != nil {
		return err
	}

	//MQTT Broker Cert
	err = CreateBrokerCerts(caKey, caCert)
	if err != nil {
		return err
	}

	//Node-Red MQTT Cert
	err = CreateNodeRedCerts(caKey, caCert)
	if err != nil {
		return err
	}

	return nil
}
