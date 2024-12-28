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

func CreateCaCerts() (*rsa.PrivateKey, []byte) {
	mainOrgName := Data.PlatformInfo.MainOrganizationName
	domainName := Data.PlatformInfo.DomainName
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(fmt.Sprintf("Error generando la clave privada de la CA: %v", err))
	}

	// 1.b Crear la plantilla para el certificado de la CA
	caTemplate := x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject: pkix.Name{
			CommonName:   domainName, // Nombre con el que identificarás tu CA
			Organization: []string{mainOrgName},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(100 * 365 * 24 * time.Hour), // 100 años de validez para la CA
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		BasicConstraintsValid: true,
		IsCA:                  true, // Indicamos que es CA
		MaxPathLen:            0,    // Permite emitir certificados
		MaxPathLenZero:        true,
	}

	// 1.c Crear el certificado de la CA, autofirmado con la clave de la propia CA
	caDERBytes, err := x509.CreateCertificate(
		rand.Reader,
		&caTemplate,
		&caTemplate, // Self-signed (padre = sí mismo)
		&caKey.PublicKey,
		caKey,
	)
	if err != nil {
		panic(fmt.Sprintf("Error creando el certificado de la CA: %v", err))
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

	caCert := string(caCertPEM)
	Data.Certs.MqttCerts.CaCerts.CaCrt = caCert
	mqttCertsCaCertName := fmt.Sprintf("mqtt_certs_ca_cert_%s.pem", GetMD5Hash(caCert))
	Data.Certs.MqttCerts.CaCerts.MqttCertsCaCertName = mqttCertsCaCertName
	Data.Certs.MqttCerts.CaCerts.ExpirationTimestamp = GetCertExpirationTimestamp(caCert)

	return caKey, caDERBytes
}

func CreateCerts(usage string, validiyDays int, caKey *rsa.PrivateKey, caDERBytes []byte) (string, string) {
	domainName := Data.PlatformInfo.DomainName
	mainOrgName := Data.PlatformInfo.MainOrganizationName

	var keyUsage x509.ExtKeyUsage
	if usage == "server" {
		keyUsage = x509.ExtKeyUsageServerAuth
	} else if usage == "client" {
		keyUsage = x509.ExtKeyUsageClientAuth
	}

	serverKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(fmt.Sprintf("Error generando la clave privada del servidor: %v", err))
	}

	timeInHours := time.Duration(validiyDays) * 24 * time.Hour
	serverTemplate := x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject: pkix.Name{
			CommonName:   domainName, // Para retrocompatibilidad
			Organization: []string{mainOrgName},
		},
		NotBefore: time.Now(),
		NotAfter:  time.Now().Add(timeInHours),
		KeyUsage:  x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{
			keyUsage,
		},
		BasicConstraintsValid: true,
		DNSNames:              []string{"localhost", domainName}, // SAN
	}

	// 2.c Parsear el certificado DER de la CA para reutilizarlo como "parent"
	parsedCACert, err := x509.ParseCertificate(caDERBytes)
	if err != nil {
		panic(fmt.Sprintf("Error parseando el CA DER: %v", err))
	}

	// 2.d Crear el certificado del servidor,
	//     firmado por la CA (que se pasa como "parent")
	serverDERBytes, err := x509.CreateCertificate(
		rand.Reader,
		&serverTemplate,
		parsedCACert, // Este es el "padre" = nuestra CA
		&serverKey.PublicKey,
		caKey, // Firmado con la clave privada de la CA
	)
	if err != nil {
		panic(fmt.Sprintf("Error creando el certificado del servidor: %v", err))
	}

	// 2.e Convertir Server Cert y Server Key a PEM (en memoria)
	serverCertPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: serverDERBytes,
	})

	serverKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(serverKey),
	})

	mqttCert := string(serverCertPEM)
	mqttKey := string(serverKeyPEM)

	return mqttCert, mqttKey
}

func MqttTLSCredentials() {
	/*******************************************************************
	CA Cert
	*******************************************************************/
	caKey, caDERBytes := CreateCaCerts()

	/*******************************************************************
	MQTT Broker Cert
	*******************************************************************/
	mqttBrokerCert, mqttBrokerKey := CreateCerts("server", 36500, caKey, caDERBytes)
	Data.Certs.MqttCerts.Broker.ServerCrt = mqttBrokerCert
	mqttBrokerCertName := fmt.Sprintf("mqtt_broker_cert_%s.pem", GetMD5Hash(mqttBrokerCert))
	Data.Certs.MqttCerts.Broker.MqttBrokerCertName = mqttBrokerCertName
	Data.Certs.MqttCerts.Broker.ExpirationTimestamp = GetCertExpirationTimestamp(mqttBrokerCert)

	Data.Certs.MqttCerts.Broker.ServerKey = mqttBrokerKey
	mqttBrokerKeyName := fmt.Sprintf("mqtt_broker_key_%s.pem", GetMD5Hash(mqttBrokerKey))
	Data.Certs.MqttCerts.Broker.MqttBrokerKeyName = mqttBrokerKeyName

	/*******************************************************************
	Node-Red MQTT Cert
	*******************************************************************/
	org_hash := utils.GeneratePassword(16)
	org_acronym := Data.PlatformInfo.MainOrganizationAcronym
	exclusiveWorkerNodes := make([]string, 0)
	nodered_instances := make([]NodeRedInstance, Data.PlatformInfo.NumberOfNodeRedInstancesInMainOrg)
	organization := Organization{
		OrgHash:              org_hash,
		OrgAcronym:           org_acronym,
		ExclusiveWorkerNodes: exclusiveWorkerNodes,
		NodeRedInstances:     nodered_instances,
	}
	Data.Certs.MqttCerts.Organizations = append(Data.Certs.MqttCerts.Organizations, organization)

	for inri := 1; inri <= Data.PlatformInfo.NumberOfNodeRedInstancesInMainOrg; inri++ {
		mqttClientCert, mqttClientKey := CreateCerts("client", 3650, caKey, caDERBytes)

		Data.Certs.MqttCerts.Organizations[0].NodeRedInstances[inri-1].ClientCrt = mqttClientCert
		mqttClientCertName := fmt.Sprintf("mqtt_client_cert_%s.pem", GetMD5Hash(mqttClientCert))
		Data.Certs.MqttCerts.Organizations[0].NodeRedInstances[inri-1].ClientCrtName = mqttClientCertName
		Data.Certs.MqttCerts.Organizations[0].NodeRedInstances[inri-1].ExpirationTimestamp = GetCertExpirationTimestamp(mqttClientCert)

		Data.Certs.MqttCerts.Organizations[0].NodeRedInstances[inri-1].ClientKey = mqttClientKey
		mqttClientKeyName := fmt.Sprintf("mqtt_client_key_%s.pem", GetMD5Hash(mqttClientKey))
		Data.Certs.MqttCerts.Organizations[0].NodeRedInstances[inri-1].ClientKeyName = mqttClientKeyName
		Data.Certs.MqttCerts.Organizations[0].NodeRedInstances[inri-1].IsVolumeCreated = "false"
		Data.Certs.MqttCerts.Organizations[0].NodeRedInstances[inri-1].NriHash = utils.GeneratePassword(10)
	}
}
