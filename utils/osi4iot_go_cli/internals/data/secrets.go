package data

import (
	"fmt"
	"strconv"
	"strings"
)

type Secret struct {
	Name string
	Data string
	ID   string
}

func GenerateSecrets() map[string]Secret {
	Secrets := make(map[string]Secret)
	mainOrgNodeRedInstances := Data.Certs.MqttCerts.Organizations[0].NodeRedInstances
	var hashes []string
	for _, nri := range mainOrgNodeRedInstances {
		hashes = append(hashes, nri.NriHash)
	}
	mainOrgNodeRedInstanceHashes := strings.Join(hashes, ",")
	domainCertsType := Data.PlatformInfo.DomainCertsType

	adminApiSecretsDataArray := []string{
		fmt.Sprintf("REGISTRATION_TOKEN_LIFETIME=%s", strconv.Itoa(Data.PlatformInfo.RegistrationTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_LIFETIME=%s", strconv.Itoa(Data.PlatformInfo.RefreshTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_SECRET=%s", Data.PlatformInfo.RefreshTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_SECRET=%s", Data.PlatformInfo.AccessTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_LIFETIME=%s", strconv.Itoa(Data.PlatformInfo.AccessTokenLifetime)),
		fmt.Sprintf("MQTT_SSL_CERTS_VALIDITY_DAYS=%s", strconv.Itoa(Data.PlatformInfo.MQTTSslCertsValidityDays)),
		fmt.Sprintf("ENCRYPTION_SECRET_KEY=%s", Data.PlatformInfo.EncryptionSecretKey),
		fmt.Sprintf("PLATFORM_ADMIN_FIRST_NAME=\"%s\"", Data.PlatformInfo.PlatformAdminFirstName),
		fmt.Sprintf("PLATFORM_ADMIN_SURNAME=\"%s\"", Data.PlatformInfo.PlatformAdminSurname),
		fmt.Sprintf("PLATFORM_ADMIN_USER_NAME=%s", Data.PlatformInfo.PlatformAdminUserName),
		fmt.Sprintf("PLATFORM_ADMIN_EMAIL=%s", Data.PlatformInfo.PlatformAdminEmail),
		fmt.Sprintf("PLATFORM_ADMIN_PASSWORD=%s", Data.PlatformInfo.PlatformAdminPassword),
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", Data.PlatformInfo.GrafanaAdminPassword),
		fmt.Sprintf("POSTGRES_USER=%s", Data.PlatformInfo.PostgresUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", Data.PlatformInfo.PostgresPassword),
		fmt.Sprintf("POSTGRES_DB=%s", Data.PlatformInfo.PostgresDB),
		fmt.Sprintf("TIMESCALE_USER=%s", Data.PlatformInfo.TimescaleUser),
		fmt.Sprintf("TIMESCALE_PASSWORD=%s", Data.PlatformInfo.TimescalePassword),
		fmt.Sprintf("TIMESCALE_DB=%s", Data.PlatformInfo.TimescaleDB),
		fmt.Sprintf("DEV2PDB_PASSWORD=%s", Data.PlatformInfo.Dev2PDBPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", Data.PlatformInfo.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", Data.PlatformInfo.NotificationsEmailPassword),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_CHAT_ID=%s", Data.PlatformInfo.MainOrganizationTelegramChatID),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK=%s", Data.PlatformInfo.MainOrganizationTelegramInviteLink),
		fmt.Sprintf("TELEGRAM_BOTTOKEN=%s", Data.PlatformInfo.TelegramBotToken),
		fmt.Sprintf("MAIN_ORG_HASH=%s", Data.Certs.MqttCerts.Organizations[0].OrgHash),
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", Data.PlatformInfo.AWSAccessKeyIDS3Bucket),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", Data.PlatformInfo.AWSSecretAccessKeyS3Bucket),
		fmt.Sprintf("MAIN_ORG_NODERED_INSTANCE_HASHES=%s", mainOrgNodeRedInstanceHashes),
	}

	adminApiSecretsData := strings.Join(adminApiSecretsDataArray, "\n")
	adminApiSecretsHash := GetMD5Hash(adminApiSecretsData)
	adminApiSecretsName := fmt.Sprintf("admin_api_%s", adminApiSecretsHash)
	adminApiSecret := Secret{
		Name: adminApiSecretsName,
		Data: adminApiSecretsData,
	}
	Secrets["admin_api"] = adminApiSecret

	if domainCertsType == "Certs provided by an CA" {
		iotPlatformCertSecret := Secret{
			Name: Data.Certs.DomainCerts.IotPlatformCertName,
			Data: Data.Certs.DomainCerts.SslCertCrt,
		}
		Secrets["iot_platform_cert"] = iotPlatformCertSecret

		iotPlatformKeySecret := Secret{
			Name: Data.Certs.DomainCerts.IotPlatformKeyName,
			Data: Data.Certs.DomainCerts.PrivateKey,
		}
		Secrets["iot_platform_key"] = iotPlatformKeySecret
	}

	mqttCaCertHash := GetMD5Hash(Data.Certs.MqttCerts.CaCerts.CaCrt)
	mqttCaCertSecretName := fmt.Sprintf("mqtt_certs_ca_cert_%s", mqttCaCertHash)
	mqttCaCertSecret := Secret{
		Name: mqttCaCertSecretName,
		Data: Data.Certs.MqttCerts.CaCerts.CaCrt,
	}

	Secrets["mqtt_certs_ca_cert"] = mqttCaCertSecret

	mqttCaKeyHash := GetMD5Hash(Data.Certs.MqttCerts.CaCerts.CaKey)
	mqttCaKeySecretName := fmt.Sprintf("mqtt_certs_ca_key_%s", mqttCaKeyHash)
	mqttCaKeySecret := Secret{
		Name: mqttCaKeySecretName,
		Data: Data.Certs.MqttCerts.CaCerts.CaKey,
	}
	Secrets["mqtt_certs_ca_key"] = mqttCaKeySecret

	mqttBrokerCertHash := GetMD5Hash(Data.Certs.MqttCerts.Broker.ServerCrt)
	mqttBrokerCertSecretName := fmt.Sprintf("mqtt_broker_cert_%s", mqttBrokerCertHash)
	mqttBrokerCertSecret := Secret{
		Name: mqttBrokerCertSecretName,
		Data: Data.Certs.MqttCerts.Broker.ServerCrt,
	}
	Secrets["mqtt_broker_cert"] = mqttBrokerCertSecret

	mqttBrokerKeyHash := GetMD5Hash(Data.Certs.MqttCerts.Broker.ServerKey)
	mqttBrokerKeySecretName := fmt.Sprintf("mqtt_broker_key_%s", mqttBrokerKeyHash)
	mqttBrokerKeySecret := Secret{
		Name: mqttBrokerKeySecretName,
		Data: Data.Certs.MqttCerts.Broker.ServerKey,
	}
	Secrets["mqtt_broker_key"] = mqttBrokerKeySecret

	grafanaSecretsDataArray := []string{
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", Data.PlatformInfo.GrafanaAdminPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", Data.PlatformInfo.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", Data.PlatformInfo.NotificationsEmailPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_ADDRESS=%s", Data.PlatformInfo.NotificationsEmailAddress),
		fmt.Sprintf("POSTGRES_DB=%s", Data.PlatformInfo.PostgresDB),
		fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", Data.PlatformInfo.GrafanaDBPassword),
		fmt.Sprintf("TIMESCALE_DB=%s", Data.PlatformInfo.TimescaleDB),
		fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", Data.PlatformInfo.GrafanaDatasourcePassword),
	}
	grafanaSecretsData := strings.Join(grafanaSecretsDataArray, "\n")
	grafanaSecretsHash := GetMD5Hash(grafanaSecretsData)
	grafanaSecretName := fmt.Sprintf("grafana_%s", grafanaSecretsHash)
	grafanaSecret := Secret{
		Name: grafanaSecretName,
		Data: grafanaSecretsData,
	}
	Secrets["grafana"] = grafanaSecret

	postgresPassword := Data.PlatformInfo.PostgresPassword
	postgresPasswordHash := GetMD5Hash(postgresPassword)
	postgresPasswordSecretName := fmt.Sprintf("postgres_password_%s", postgresPasswordHash)
	postgresPasswordSecret := Secret{
		Name: postgresPasswordSecretName,
		Data: postgresPassword,
	}
	Secrets["postgres_password"] = postgresPasswordSecret

	postgresUser := Data.PlatformInfo.PostgresUser
	postgresUserHash := GetMD5Hash(postgresUser)
	postgresUserSecretName := fmt.Sprintf("postgres_user_%s", postgresUserHash)
	postgresUserSecret := Secret{
		Name: postgresUserSecretName,
		Data: postgresUser,
	}
	Secrets["postgres_user"] = postgresUserSecret

	postgresGrafana := fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", Data.PlatformInfo.GrafanaDBPassword)
	postgresGrafanaHash := GetMD5Hash(postgresGrafana)
	postgresGrafanaSecretName := fmt.Sprintf("postgres_grafana_%s", postgresGrafanaHash)
	postgresGrafanaSecret := Secret{
		Name: postgresGrafanaSecretName,
		Data: postgresGrafana,
	}
	Secrets["postgres_grafana"] = postgresGrafanaSecret

	timescalePassword := Data.PlatformInfo.TimescalePassword
	timescalePasswordHash := GetMD5Hash(timescalePassword)
	timescalePasswordSecretName := fmt.Sprintf("timescale_password_%s", timescalePasswordHash)
	timescalePasswordSecret := Secret{
		Name: timescalePasswordSecretName,
		Data: timescalePassword,
	}
	Secrets["timescale_password"] = timescalePasswordSecret

	timescaleUser := Data.PlatformInfo.TimescaleUser
	timescaleUserHash := GetMD5Hash(timescaleUser)
	timescaleUserSecretName := fmt.Sprintf("timescale_user_%s", timescaleUserHash)
	timescaleUserSecret := Secret{
		Name: timescaleUserSecretName,
		Data: timescaleUser,
	}
	Secrets["timescale_user"] = timescaleUserSecret

	timescaleGrafana := fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", Data.PlatformInfo.GrafanaDatasourcePassword)
	timescaleGrafanaHash := GetMD5Hash(timescaleGrafana)
	timescaleGrafanaSecretName := fmt.Sprintf("timescale_grafana_%s", timescaleGrafanaHash)
	timescaleGrafanaSecret := Secret{
		Name: timescaleGrafanaSecretName,
		Data: timescaleGrafana,
	}
	Secrets["timescale_grafana"] = timescaleGrafanaSecret

	timescaleDataRetInt := fmt.Sprintf("DATA_RETENTION_INTERVAL=%s", Data.PlatformInfo.TimescaleDataRetentionInterval)
	timescaleDataRetIntHash := GetMD5Hash(timescaleDataRetInt)
	timescaleDataRetIntSecretName := fmt.Sprintf("timescale_data_ret_int_%s", timescaleDataRetIntHash)
	timescaleDataRetIntSecret := Secret{
		Name: timescaleDataRetIntSecretName,
		Data: timescaleDataRetInt,
	}
	Secrets["timescale_data_ret_int"] = timescaleDataRetIntSecret

	dev2pdbPassword := Data.PlatformInfo.Dev2PDBPassword
	dev2pdbPasswordHash := GetMD5Hash(dev2pdbPassword)
	dev2pdbPasswordSecretName := fmt.Sprintf("dev2pdb_password_%s", dev2pdbPasswordHash)
	dev2pdbPasswordSecret := Secret{
		Name: dev2pdbPasswordSecretName,
		Data: dev2pdbPassword,
	}
	Secrets["dev2pdb_password"] = dev2pdbPasswordSecret

	minioSecrets := []string{
		fmt.Sprintf("MINIO_ROOT_USER=%s", Data.PlatformInfo.PlatformAdminUserName),
		fmt.Sprintf("MINIO_ROOT_PASSWORD=%s", Data.PlatformInfo.PlatformAdminPassword),
	}
	minioSecretsData := strings.Join(minioSecrets, "\n")
	minioSecretsHash := GetMD5Hash(minioSecretsData)
	minioSecretsName := fmt.Sprintf("minio_%s", minioSecretsHash)
	minioSecret := Secret{
		Name: minioSecretsName,
		Data: minioSecretsData,
	}
	Secrets["minio"] = minioSecret

	pgadmin4Secrets := []string{
		fmt.Sprintf("PGADMIN_DEFAULT_EMAIL=%s", Data.PlatformInfo.PGAdminDefaultEmail),
		fmt.Sprintf("PGADMIN_DEFAULT_PASSWORD=%s", Data.PlatformInfo.PGAdminDefaultPassword),
		fmt.Sprintf("POSTGRES_USER=%s", Data.PlatformInfo.PostgresUser),
		fmt.Sprintf("TIMESCALE_USER=%s", Data.PlatformInfo.TimescaleUser),
	}
	pgadmin4SecretsData := strings.Join(pgadmin4Secrets, "\n")
	pgadmin4SecretsHash := GetMD5Hash(pgadmin4SecretsData)
	pgadmin4SecretsName := fmt.Sprintf("pgadmin4_%s", pgadmin4SecretsHash)
	pgadmin4Secret := Secret{
		Name: pgadmin4SecretsName,
		Data: pgadmin4SecretsData,
	}
	Secrets["pgadmin4"] = pgadmin4Secret

	s3StorageSecrets := []string{
		fmt.Sprintf("POSTGRES_USER=%s", Data.PlatformInfo.PostgresUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", Data.PlatformInfo.PostgresPassword),
		fmt.Sprintf("POSTGRES_DB=%s", Data.PlatformInfo.PostgresDB),
		fmt.Sprintf("TIMESCALE_USER=%s", Data.PlatformInfo.TimescaleUser),
		fmt.Sprintf("TIMESCALE_PASSWORD=%s", Data.PlatformInfo.TimescalePassword),
		fmt.Sprintf("TIMESCALE_DB=%s", Data.PlatformInfo.TimescaleDB),
		fmt.Sprintf("AWS_ACCESS_KEY_ID_S3_BUCKET=%s", Data.PlatformInfo.AWSAccessKeyIDS3Bucket),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY_S3_BUCKET=%s", Data.PlatformInfo.AWSSecretAccessKeyS3Bucket),
	}
	s3StorageSecretsData := strings.Join(s3StorageSecrets, "\n")
	s3StorageSecretsHash := GetMD5Hash(s3StorageSecretsData)
	s3StorageSecretsName := fmt.Sprintf("s3_storage_%s", s3StorageSecretsHash)
	s3StorageSecret := Secret{
		Name: s3StorageSecretsName,
		Data: s3StorageSecretsData,
	}
	Secrets["s3_storage"] = s3StorageSecret

	for iorg := 0; iorg < len(Data.Certs.MqttCerts.Organizations); iorg++ {
		orgAcronym := strings.ToLower(Data.Certs.MqttCerts.Organizations[iorg].OrgAcronym)
		numNodeRedInstances := len(Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances)
		for inri := 0; inri < numNodeRedInstances; inri++ {
			nriHash := Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].NriHash
			mqttClientCertSecretKey := fmt.Sprintf("%s_%s_cert", orgAcronym, nriHash)
			mqttClientCertSecret := Secret{
				Name: Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientCrtName,
				Data: Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientCrt,
			}
			Secrets[mqttClientCertSecretKey] = mqttClientCertSecret

			mqttClientKeySecretKey := fmt.Sprintf("%s_%s_key", orgAcronym, nriHash)
			mqttClientKeySecret := Secret{
				Name: Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientKeyName,
				Data: Data.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientKey,
			}
			Secrets[mqttClientKeySecretKey] = mqttClientKeySecret
		}
	}

	return Secrets
}
