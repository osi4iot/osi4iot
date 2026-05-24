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
	adminApiSecretsDataArray := []string{
		fmt.Sprintf("REGISTRATION_TOKEN_LIFETIME=%s", strconv.Itoa(pd.PlatformInfo.RegistrationTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_LIFETIME=%s", strconv.Itoa(pd.PlatformInfo.RefreshTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_SECRET=%s", pd.PlatformInfo.RefreshTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_SECRET=%s", pd.PlatformInfo.AccessTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_LIFETIME=%s", strconv.Itoa(pd.PlatformInfo.AccessTokenLifetime)),
		fmt.Sprintf("MQTT_SSL_CERTS_VALIDITY_DAYS=%s", strconv.Itoa(pd.PlatformInfo.MQTTSslCertsValidityDays)),
		fmt.Sprintf("ENCRYPTION_SECRET_KEY=%s", pd.PlatformInfo.EncryptionSecretKey),
		fmt.Sprintf("PLATFORM_ADMIN_FIRST_NAME=\"%s\"", pd.PlatformInfo.PlatformAdminFirstName),
		fmt.Sprintf("PLATFORM_ADMIN_SURNAME=\"%s\"", pd.PlatformInfo.PlatformAdminSurname),
		fmt.Sprintf("PLATFORM_ADMIN_USER_NAME=%s", pd.PlatformInfo.PlatformAdminUserName),
		fmt.Sprintf("PLATFORM_ADMIN_EMAIL=%s", pd.PlatformInfo.PlatformAdminEmail),
		fmt.Sprintf("PLATFORM_ADMIN_PASSWORD=%s", pd.PlatformInfo.PlatformAdminPassword),
		fmt.Sprintf("PLATFORM_ADMIN_NATS_PUBLIC=%s", pd.PlatformInfo.PlatformAdminNatsPublicKey),
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", pd.PlatformInfo.GrafanaAdminPassword),
		fmt.Sprintf("POSTGRES_USER=%s", pd.PlatformInfo.PostgresUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", pd.PlatformInfo.PostgresPassword),
		fmt.Sprintf("POSTGRES_DB=%s", pd.PlatformInfo.PostgresDB),
		fmt.Sprintf("TIMESCALE_USER=%s", pd.PlatformInfo.TimescaleUser),
		fmt.Sprintf("TIMESCALE_PASSWORD=%s", pd.PlatformInfo.TimescalePassword),
		fmt.Sprintf("TIMESCALE_DB=%s", pd.PlatformInfo.TimescaleDB),
		fmt.Sprintf("NATS_ADMIN_USERNAME=%s", pd.Certs.NatsCerts.NatsAdminUsername),
		fmt.Sprintf("NATS_ADMIN_PASSWORD=%s", pd.Certs.NatsCerts.NatsAdminPassword),
		fmt.Sprintf("NATS_NUM_REPLICAS=%d", numNatsReplicas),
		fmt.Sprintf("NATS_NUM_NODES=%d", pd.PlatformInfo.NumOfNatsNodes),
		fmt.Sprintf("NATS_SEED=%s", pd.Certs.NatsCerts.AdminApiNKeySeed),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", pd.PlatformInfo.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", pd.PlatformInfo.NotificationsEmailPassword),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_CHAT_ID=%s", pd.PlatformInfo.MainOrganizationTelegramChatID),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK=%s", pd.PlatformInfo.MainOrganizationTelegramInviteLink),
		fmt.Sprintf("TELEGRAM_BOTTOKEN=%s", pd.PlatformInfo.TelegramBotToken),
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", pd.PlatformInfo.AWSAccessKeyIDS3Bucket),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", pd.PlatformInfo.AWSSecretAccessKeyS3Bucket),
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