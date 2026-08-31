package secrets

import (
	"fmt"
	"strconv"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func CreateAdminApiConfigSecret(
	pd *pt.PlatformData,
	numNatsReplicas int,
) pt.Secret {

	pi := pd.PlatformInfo
	postgresHost := "postgres"
	postgresPort := "5432"
	postgresReadPort := "5432"
	timescaleHost := "timescaledb"
	timescalePort := "5432"
	timescaleReadPort := "5432"
	if pi.UsePatroniTool {
		postgresHost = "haproxy_patroni"
		postgresPort = "5000"
		postgresReadPort = "5001"
		timescaleHost = "haproxy_patroni"
		timescalePort = "5100"
		timescaleReadPort = "5101"
	}
	
	adminApiSecretsDataArray := []string{
		fmt.Sprintf("REGISTRATION_TOKEN_LIFETIME=%s", strconv.Itoa(pi.RegistrationTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_LIFETIME=%s", strconv.Itoa(pi.RefreshTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_SECRET=%s", pi.RefreshTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_SECRET=%s", pi.AccessTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_LIFETIME=%s", strconv.Itoa(pi.AccessTokenLifetime)),
		fmt.Sprintf("MQTT_SSL_CERTS_VALIDITY_DAYS=%s", strconv.Itoa(pi.MQTTSslCertsValidityDays)),
		fmt.Sprintf("ENCRYPTION_SECRET_KEY=%s", pi.EncryptionSecretKey),
		fmt.Sprintf("PLATFORM_ADMIN_FIRST_NAME=\"%s\"", pi.PlatformAdminFirstName),
		fmt.Sprintf("PLATFORM_ADMIN_SURNAME=\"%s\"", pi.PlatformAdminSurname),
		fmt.Sprintf("PLATFORM_ADMIN_USER_NAME=%s", pi.PlatformAdminUserName),
		fmt.Sprintf("PLATFORM_ADMIN_EMAIL=%s", pi.PlatformAdminEmail),
		fmt.Sprintf("PLATFORM_ADMIN_PASSWORD=%s", pi.PlatformAdminPassword),
		fmt.Sprintf("PLATFORM_ADMIN_NATS_PUBLIC=%s", pi.PlatformAdminNatsPublicKey),
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", pi.GrafanaAdminPassword),
		fmt.Sprintf("POSTGRES_USER=%s", pi.PostgresUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", pi.PostgresPassword),
		fmt.Sprintf("POSTGRES_DB=%s", pi.PostgresDB),
		fmt.Sprintf("POSTGRES_HOST=%s", postgresHost),
		fmt.Sprintf("POSTGRES_PORT=%s", postgresPort),
		fmt.Sprintf("POSTGRES_READ_PORT=%s", postgresReadPort),
		fmt.Sprintf("TIMESCALE_USER=%s", pi.TimescaleUser),
		fmt.Sprintf("TIMESCALE_PASSWORD=%s", pi.TimescalePassword),
		fmt.Sprintf("TIMESCALE_DB=%s", pi.TimescaleDB),
		fmt.Sprintf("TIMESCALE_HOST=%s", timescaleHost),
		fmt.Sprintf("TIMESCALE_PORT=%s", timescalePort),
		fmt.Sprintf("TIMESCALE_READ_PORT=%s", timescaleReadPort),
		fmt.Sprintf("NATS_ADMIN_USERNAME=%s", pd.Certs.NatsCerts.NatsAdminUsername),
		fmt.Sprintf("NATS_ADMIN_PASSWORD=%s", pd.Certs.NatsCerts.NatsAdminPassword),
		fmt.Sprintf("NATS_NUM_REPLICAS=%d", numNatsReplicas),
		fmt.Sprintf("NATS_NUM_NODES=%d", pi.NumOfNatsNodes),
		fmt.Sprintf("NATS_SEED=%s", pd.Certs.NatsCerts.AdminApiNKeySeed),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", pi.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", pi.NotificationsEmailPassword),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_CHAT_ID=%s", pi.MainOrganizationTelegramChatID),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK=%s", pi.MainOrganizationTelegramInviteLink),
		fmt.Sprintf("TELEGRAM_BOTTOKEN=%s", pi.TelegramBotToken),
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", pi.AWSAccessKeyIDS3Bucket),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", pi.AWSSecretAccessKeyS3Bucket),
	}

	adminApiSecretsData := strings.Join(adminApiSecretsDataArray, "\n")
	adminApiSecretsHash := utils.GetMD5Hash(adminApiSecretsData)
	adminApiSecretsName := fmt.Sprintf("admin_api_%s", adminApiSecretsHash)
	adminApiSecret := pt.Secret{
		Name: adminApiSecretsName,
		Data: adminApiSecretsData,
	}
	return adminApiSecret
}