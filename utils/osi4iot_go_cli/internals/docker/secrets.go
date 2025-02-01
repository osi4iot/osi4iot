package docker

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

type Secret struct {
	Name string
	Data string
	ID   string
}

func GenerateSecrets(platformData *common.PlatformData) map[string]Secret {
	Secrets := make(map[string]Secret)
	mainOrgNodeRedInstances := platformData.Certs.MqttCerts.Organizations[0].NodeRedInstances
	var hashes []string
	for _, nri := range mainOrgNodeRedInstances {
		hashes = append(hashes, nri.NriHash)
	}
	mainOrgNodeRedInstanceHashes := strings.Join(hashes, ",")
	domainCertsType := platformData.PlatformInfo.DomainCertsType

	adminApiSecretsDataArray := []string{
		fmt.Sprintf("REGISTRATION_TOKEN_LIFETIME=%s", strconv.Itoa(platformData.PlatformInfo.RegistrationTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_LIFETIME=%s", strconv.Itoa(platformData.PlatformInfo.RefreshTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_SECRET=%s", platformData.PlatformInfo.RefreshTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_SECRET=%s",platformData.PlatformInfo.AccessTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_LIFETIME=%s", strconv.Itoa(platformData.PlatformInfo.AccessTokenLifetime)),
		fmt.Sprintf("MQTT_SSL_CERTS_VALIDITY_DAYS=%s", strconv.Itoa(platformData.PlatformInfo.MQTTSslCertsValidityDays)),
		fmt.Sprintf("ENCRYPTION_SECRET_KEY=%s", platformData.PlatformInfo.EncryptionSecretKey),
		fmt.Sprintf("PLATFORM_ADMIN_FIRST_NAME=\"%s\"", platformData.PlatformInfo.PlatformAdminFirstName),
		fmt.Sprintf("PLATFORM_ADMIN_SURNAME=\"%s\"", platformData.PlatformInfo.PlatformAdminSurname),
		fmt.Sprintf("PLATFORM_ADMIN_USER_NAME=%s", platformData.PlatformInfo.PlatformAdminUserName),
		fmt.Sprintf("PLATFORM_ADMIN_EMAIL=%s", platformData.PlatformInfo.PlatformAdminEmail),
		fmt.Sprintf("PLATFORM_ADMIN_PASSWORD=%s", platformData.PlatformInfo.PlatformAdminPassword),
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", platformData.PlatformInfo.GrafanaAdminPassword),
		fmt.Sprintf("POSTGRES_USER=%s", platformData.PlatformInfo.PostgresUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", platformData.PlatformInfo.PostgresPassword),
		fmt.Sprintf("POSTGRES_DB=%s", platformData.PlatformInfo.PostgresDB),
		fmt.Sprintf("TIMESCALE_USER=%s", platformData.PlatformInfo.TimescaleUser),
		fmt.Sprintf("TIMESCALE_PASSWORD=%s", platformData.PlatformInfo.TimescalePassword),
		fmt.Sprintf("TIMESCALE_DB=%s", platformData.PlatformInfo.TimescaleDB),
		fmt.Sprintf("DEV2PDB_PASSWORD=%s", platformData.PlatformInfo.Dev2PDBPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", platformData.PlatformInfo.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", platformData.PlatformInfo.NotificationsEmailPassword),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_CHAT_ID=%s", platformData.PlatformInfo.MainOrganizationTelegramChatID),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK=%s", platformData.PlatformInfo.MainOrganizationTelegramInviteLink),
		fmt.Sprintf("TELEGRAM_BOTTOKEN=%s", platformData.PlatformInfo.TelegramBotToken),
		fmt.Sprintf("MAIN_ORG_HASH=%s", platformData.Certs.MqttCerts.Organizations[0].OrgHash),
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", platformData.PlatformInfo.AWSAccessKeyIDS3Bucket),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", platformData.PlatformInfo.AWSSecretAccessKeyS3Bucket),
		fmt.Sprintf("MAIN_ORG_NODERED_INSTANCE_HASHES=%s", mainOrgNodeRedInstanceHashes),
	}

	adminApiSecretsData := strings.Join(adminApiSecretsDataArray, "\n")
	adminApiSecretsHash := utils.GetMD5Hash(adminApiSecretsData)
	adminApiSecretsName := fmt.Sprintf("admin_api_%s", adminApiSecretsHash)
	adminApiSecret := Secret{
		Name: adminApiSecretsName,
		Data: adminApiSecretsData,
	}
	Secrets["admin_api"] = adminApiSecret

	if domainCertsType == "Certs provided by an CA" {
		iotPlatformCertSecret := Secret{
			Name: platformData.Certs.DomainCerts.IotPlatformCertName,
			Data: platformData.Certs.DomainCerts.SslCertCrt,
		}
		Secrets["iot_platform_cert"] = iotPlatformCertSecret
		
		iotPlatformKeySecret := Secret{
			Name: platformData.Certs.DomainCerts.IotPlatformKeyName,
			Data: platformData.Certs.DomainCerts.PrivateKey,
		}
		Secrets["iot_platform_key"] = iotPlatformKeySecret
	}

	mqttCaCertHash := utils.GetMD5Hash(platformData.Certs.MqttCerts.CaCerts.CaCrt)
	mqttCaCertSecretName := fmt.Sprintf("mqtt_certs_ca_cert_%s", mqttCaCertHash)
	mqttCaCertSecret := Secret{
		Name: mqttCaCertSecretName,
		Data: platformData.Certs.MqttCerts.CaCerts.CaCrt,
	}

	Secrets["mqtt_certs_ca_cert"] = mqttCaCertSecret

	mqttCaKeyHash := utils.GetMD5Hash(platformData.Certs.MqttCerts.CaCerts.CaKey)
	mqttCaKeySecretName := fmt.Sprintf("mqtt_certs_ca_key_%s", mqttCaKeyHash)
	mqttCaKeySecret := Secret{
		Name: mqttCaKeySecretName,
		Data: platformData.Certs.MqttCerts.CaCerts.CaKey,
	}
	Secrets["mqtt_certs_ca_key"] = mqttCaKeySecret

	mqttBrokerCertHash := utils.GetMD5Hash(platformData.Certs.MqttCerts.Broker.ServerCrt)
	mqttBrokerCertSecretName := fmt.Sprintf("mqtt_broker_cert_%s", mqttBrokerCertHash)
	mqttBrokerCertSecret := Secret{
		Name: mqttBrokerCertSecretName,
		Data: platformData.Certs.MqttCerts.Broker.ServerCrt,
	}
	Secrets["mqtt_broker_cert"] = mqttBrokerCertSecret

	mqttBrokerKeyHash := utils.GetMD5Hash(platformData.Certs.MqttCerts.Broker.ServerKey)
	mqttBrokerKeySecretName := fmt.Sprintf("mqtt_broker_key_%s", mqttBrokerKeyHash)
	mqttBrokerKeySecret := Secret{
		Name: mqttBrokerKeySecretName,
		Data: platformData.Certs.MqttCerts.Broker.ServerKey,
	}
	Secrets["mqtt_broker_key"] = mqttBrokerKeySecret

	grafanaSecretsDataArray := []string{
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", platformData.PlatformInfo.GrafanaAdminPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", platformData.PlatformInfo.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", platformData.PlatformInfo.NotificationsEmailPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_ADDRESS=%s", platformData.PlatformInfo.NotificationsEmailAddress),
		fmt.Sprintf("POSTGRES_DB=%s", platformData.PlatformInfo.PostgresDB),
		fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", platformData.PlatformInfo.GrafanaDBPassword),
		fmt.Sprintf("TIMESCALE_DB=%s", platformData.PlatformInfo.TimescaleDB),
		fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", platformData.PlatformInfo.GrafanaDatasourcePassword),
	}
	grafanaSecretsData := strings.Join(grafanaSecretsDataArray, "\n")
	grafanaSecretsHash := utils.GetMD5Hash(grafanaSecretsData)
	grafanaSecretName := fmt.Sprintf("grafana_%s", grafanaSecretsHash)
	grafanaSecret := Secret{
		Name: grafanaSecretName,
		Data: grafanaSecretsData,
	}
	Secrets["grafana"] = grafanaSecret

	postgresPassword := platformData.PlatformInfo.PostgresPassword
	postgresPasswordHash := utils.GetMD5Hash(postgresPassword)
	postgresPasswordSecretName := fmt.Sprintf("postgres_password_%s", postgresPasswordHash)
	postgresPasswordSecret := Secret{
		Name: postgresPasswordSecretName,
		Data: postgresPassword,
	}
	Secrets["postgres_password"] = postgresPasswordSecret

	postgresUser := platformData.PlatformInfo.PostgresUser
	postgresUserHash := utils.GetMD5Hash(postgresUser)
	postgresUserSecretName := fmt.Sprintf("postgres_user_%s", postgresUserHash)
	postgresUserSecret := Secret{
		Name: postgresUserSecretName,
		Data: postgresUser,
	}
	Secrets["postgres_user"] = postgresUserSecret

	postgresGrafana := fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", platformData.PlatformInfo.GrafanaDBPassword)
	postgresGrafanaHash := utils.GetMD5Hash(postgresGrafana)
	postgresGrafanaSecretName := fmt.Sprintf("postgres_grafana_%s", postgresGrafanaHash)
	postgresGrafanaSecret := Secret{
		Name: postgresGrafanaSecretName,
		Data: postgresGrafana,
	}
	Secrets["postgres_grafana"] = postgresGrafanaSecret

	timescalePassword := platformData.PlatformInfo.TimescalePassword
	timescalePasswordHash := utils.GetMD5Hash(timescalePassword)
	timescalePasswordSecretName := fmt.Sprintf("timescale_password_%s", timescalePasswordHash)
	timescalePasswordSecret := Secret{
		Name: timescalePasswordSecretName,
		Data: timescalePassword,
	}
	Secrets["timescale_password"] = timescalePasswordSecret

	timescaleUser := platformData.PlatformInfo.TimescaleUser
	timescaleUserHash := utils.GetMD5Hash(timescaleUser)
	timescaleUserSecretName := fmt.Sprintf("timescale_user_%s", timescaleUserHash)
	timescaleUserSecret := Secret{
		Name: timescaleUserSecretName,
		Data: timescaleUser,
	}
	Secrets["timescale_user"] = timescaleUserSecret

	timescaleGrafana := fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", platformData.PlatformInfo.GrafanaDatasourcePassword)
	timescaleGrafanaHash := utils.GetMD5Hash(timescaleGrafana)
	timescaleGrafanaSecretName := fmt.Sprintf("timescale_grafana_%s", timescaleGrafanaHash)
	timescaleGrafanaSecret := Secret{
		Name: timescaleGrafanaSecretName,
		Data: timescaleGrafana,
	}
	Secrets["timescale_grafana"] = timescaleGrafanaSecret

	timescaleDataRetInt := fmt.Sprintf("DATA_RETENTION_INTERVAL=%s", platformData.PlatformInfo.TimescaleDataRetentionInterval)
	timescaleDataRetIntHash := utils.GetMD5Hash(timescaleDataRetInt)
	timescaleDataRetIntSecretName := fmt.Sprintf("timescale_data_ret_int_%s", timescaleDataRetIntHash)
	timescaleDataRetIntSecret := Secret{
		Name: timescaleDataRetIntSecretName,
		Data: timescaleDataRetInt,
	}
	Secrets["timescale_data_ret_int"] = timescaleDataRetIntSecret

	dev2pdbPassword := platformData.PlatformInfo.Dev2PDBPassword
	dev2pdbPasswordHash := utils.GetMD5Hash(dev2pdbPassword)
	dev2pdbPasswordSecretName := fmt.Sprintf("dev2pdb_password_%s", dev2pdbPasswordHash)
	dev2pdbPasswordSecret := Secret{
		Name: dev2pdbPasswordSecretName,
		Data: dev2pdbPassword,
	}
	Secrets["dev2pdb_password"] = dev2pdbPasswordSecret

	minioSecrets := []string{
		fmt.Sprintf("MINIO_ROOT_USER=%s", platformData.PlatformInfo.PlatformAdminUserName),
		fmt.Sprintf("MINIO_ROOT_PASSWORD=%s", platformData.PlatformInfo.PlatformAdminPassword),
	}
	minioSecretsData := strings.Join(minioSecrets, "\n")
	minioSecretsHash := utils.GetMD5Hash(minioSecretsData)
	minioSecretsName := fmt.Sprintf("minio_%s", minioSecretsHash)
	minioSecret := Secret{
		Name: minioSecretsName,
		Data: minioSecretsData,
	}
	Secrets["minio"] = minioSecret

	pgadmin4Secrets := []string{
		fmt.Sprintf("PGADMIN_DEFAULT_EMAIL=%s", platformData.PlatformInfo.PGAdminDefaultEmail),
		fmt.Sprintf("PGADMIN_DEFAULT_PASSWORD=%s", platformData.PlatformInfo.PGAdminDefaultPassword),
		fmt.Sprintf("POSTGRES_USER=%s", platformData.PlatformInfo.PostgresUser),
		fmt.Sprintf("TIMESCALE_USER=%s", platformData.PlatformInfo.TimescaleUser),
	}
	pgadmin4SecretsData := strings.Join(pgadmin4Secrets, "\n")
	pgadmin4SecretsHash := utils.GetMD5Hash(pgadmin4SecretsData)
	pgadmin4SecretsName := fmt.Sprintf("pgadmin4_%s", pgadmin4SecretsHash)
	pgadmin4Secret := Secret{
		Name: pgadmin4SecretsName,
		Data: pgadmin4SecretsData,
	}
	Secrets["pgadmin4"] = pgadmin4Secret

	s3StorageSecrets := []string{
		fmt.Sprintf("POSTGRES_USER=%s", platformData.PlatformInfo.PostgresUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", platformData.PlatformInfo.PostgresPassword),
		fmt.Sprintf("POSTGRES_DB=%s", platformData.PlatformInfo.PostgresDB),
		fmt.Sprintf("TIMESCALE_USER=%s", platformData.PlatformInfo.TimescaleUser),
		fmt.Sprintf("TIMESCALE_PASSWORD=%s", platformData.PlatformInfo.TimescalePassword),
		fmt.Sprintf("TIMESCALE_DB=%s", platformData.PlatformInfo.TimescaleDB),
		fmt.Sprintf("AWS_ACCESS_KEY_ID_S3_BUCKET=%s", platformData.PlatformInfo.AWSAccessKeyIDS3Bucket),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY_S3_BUCKET=%s", platformData.PlatformInfo.AWSSecretAccessKeyS3Bucket),
	}
	s3StorageSecretsData := strings.Join(s3StorageSecrets, "\n")
	s3StorageSecretsHash := utils.GetMD5Hash(s3StorageSecretsData)
	s3StorageSecretsName := fmt.Sprintf("s3_storage_%s", s3StorageSecretsHash)
	s3StorageSecret := Secret{
		Name: s3StorageSecretsName,
		Data: s3StorageSecretsData,
	}
	Secrets["s3_storage"] = s3StorageSecret

	for iorg := 0; iorg < len(platformData.Certs.MqttCerts.Organizations); iorg++ {
		orgAcronym := strings.ToLower(platformData.Certs.MqttCerts.Organizations[iorg].OrgAcronym)
		numNodeRedInstances := len(platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances)
		for inri := 0; inri < numNodeRedInstances; inri++ {
			nriHash := platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].NriHash
			mqttClientCertSecretKey := fmt.Sprintf("%s_%s_cert", orgAcronym, nriHash)
			mqttClientCertSecret := Secret{
				Name: platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientCrtName,
				Data: platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientCrt,
			}
			Secrets[mqttClientCertSecretKey] = mqttClientCertSecret

			mqttClientKeySecretKey := fmt.Sprintf("%s_%s_key", orgAcronym, nriHash)
			mqttClientKeySecret := Secret{
				Name: platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientKeyName,
				Data: platformData.Certs.MqttCerts.Organizations[iorg].NodeRedInstances[inri].ClientKey,
			}
			Secrets[mqttClientKeySecretKey] = mqttClientKeySecret
		}
	}

	return Secrets
}
