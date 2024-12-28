package data

import (
	"fmt"
	"strconv"
	"strings"
)

type Secrets struct {
	AdminAPI            string
	Grafana             string
	PostgresPassword    string
	PostgresUser        string
	PostgresGrafana     string
	TimescalePassword   string
	TimescaleUser       string
	TimescalceGrafana   string
	TimescaleDataRetInt string
	Dev2pdbPassword     string
	Minio               string
	Pgadmin4            string
	S3Storage           string
}

func GenerateSecrets() Secrets {
	mainOrgNodeRedInstances := Data.Certs.MqttCerts.Organizations[0].NodeRedInstances
	var hashes []string
	for _, nri := range mainOrgNodeRedInstances {
		hashes = append(hashes, nri.NriHash)
	}
	mainOrgNodeRedInstanceHashes := strings.Join(hashes, ",")

	adminApiSecrets := []string{
		fmt.Sprintf("REGISTRATION_TOKEN_LIFETIME=%s", strconv.Itoa(Data.PlatformInfo.RegistrationTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_LIFETIME=%s", strconv.Itoa(Data.PlatformInfo.RefreshTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_SECRET=%s", Data.PlatformInfo.RefreshTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_SECRET=%s", Data.PlatformInfo.AccessTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_LIFETIME=%s", strconv.Itoa(Data.PlatformInfo.AccessTokenLifetime)),
		fmt.Sprintf("MQTT_SSL_CERTS_VALIDITY_DAYS=%s", strconv.Itoa(Data.PlatformInfo.MQTTSslCertsValidityDays)),
		fmt.Sprintf("ENCRYPTION_SECRET_KEY=%s\n", Data.PlatformInfo.EncryptionSecretKey),
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
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", Data.PlatformInfo.AWSAccessKeyID),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", Data.PlatformInfo.AWSSecretAccessKey),
		fmt.Sprintf("MAIN_ORG_NODERED_INSTANCE_HASHES=%s", mainOrgNodeRedInstanceHashes),
	}

	grafanaSecrets := []string{
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", Data.PlatformInfo.GrafanaAdminPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", Data.PlatformInfo.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", Data.PlatformInfo.NotificationsEmailPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_ADDRESS=%s", Data.PlatformInfo.NotificationsEmailAddress),
		fmt.Sprintf("POSTGRES_DB=%s", Data.PlatformInfo.PostgresDB),
		fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", Data.PlatformInfo.GrafanaDBPassword),
		fmt.Sprintf("TIMESCALE_DB=%s", Data.PlatformInfo.TimescaleDB),
		fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", Data.PlatformInfo.GrafanaDatasourcePassword),
	}

	postgresPassword := Data.PlatformInfo.PostgresPassword
	postgresUser := Data.PlatformInfo.PostgresUser
	postgresGrafana := fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", Data.PlatformInfo.GrafanaDBPassword)

	timescalePassword := Data.PlatformInfo.TimescalePassword
	timescaleUser := Data.PlatformInfo.TimescaleUser
	timescaleGrafana := fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", Data.PlatformInfo.GrafanaDatasourcePassword)
	timescaleDataRetInt := fmt.Sprintf("DATA_RETENTION_INTERVAL=%s", Data.PlatformInfo.TimescaleDataRetentionInterval)

	dev2pdbPassword := Data.PlatformInfo.Dev2PDBPassword

	minioSecrets := []string{
		fmt.Sprintf("MINIO_ROOT_USER=%s", Data.PlatformInfo.PlatformAdminUserName),
		fmt.Sprintf("MINIO_ROOT_PASSWORD=%s", Data.PlatformInfo.PlatformAdminPassword),
	}

	pgadmin4Secrets := []string{
		fmt.Sprintf("PGADMIN_DEFAULT_EMAIL=%s", Data.PlatformInfo.PGAdminDefaultEmail),
		fmt.Sprintf("PGADMIN_DEFAULT_PASSWORD=%s", Data.PlatformInfo.PGAdminDefaultPassword),
		fmt.Sprintf("POSTGRES_USER=%s", Data.PlatformInfo.PostgresUser),
		fmt.Sprintf("TIMESCALE_USER=%s", Data.PlatformInfo.TimescaleUser),
	}

	s3StorageSecrets := []string{
		fmt.Sprintf("POSTGRES_USER=%s", Data.PlatformInfo.PostgresUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", Data.PlatformInfo.PostgresPassword),
		fmt.Sprintf("POSTGRES_DB=%s", Data.PlatformInfo.PostgresDB),
		fmt.Sprintf("TIMESCALE_USER=%s", Data.PlatformInfo.TimescaleUser),
		fmt.Sprintf("TIMESCALE_PASSWORD=%s", Data.PlatformInfo.TimescalePassword),
		fmt.Sprintf("TIMESCALE_DB=%s", Data.PlatformInfo.TimescaleDB),
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", Data.PlatformInfo.AWSAccessKeyID),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", Data.PlatformInfo.AWSSecretAccessKey),
	}

	secrets := Secrets{
		AdminAPI:            strings.Join(adminApiSecrets, "\n"),
		Grafana:             strings.Join(grafanaSecrets, "\n"),
		PostgresPassword:    postgresPassword,
		PostgresUser:        postgresUser,
		PostgresGrafana:     postgresGrafana,
		TimescalePassword:   timescalePassword,
		TimescaleUser:       timescaleUser,
		TimescalceGrafana:   timescaleGrafana,
		TimescaleDataRetInt: timescaleDataRetInt,
		Dev2pdbPassword:     dev2pdbPassword,
		Minio:               strings.Join(minioSecrets, "\n"),
		Pgadmin4:            strings.Join(pgadmin4Secrets, "\n"),
		S3Storage:           strings.Join(s3StorageSecrets, "\n"),
	}

	return secrets
}
