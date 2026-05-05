package secrets

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/certrenewer"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func GenerateSecrets(pd *pt.PlatformData) map[string]pt.Secret {
	pi := pd.PlatformInfo
	Secrets := make(map[string]pt.Secret)
	domainCertsType := pi.DomainCertsType
	numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
	Secrets["admin_api"] = CreateAdminApiConfigSecret(pd, numNatsReplicas)

	if domainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		certrenewer.SetOrUpdateAcmeCerts(pd)
	}

	if domainCertsType == "Certs provided by an CA" ||
		domainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		iotPlatformCertSecret := pt.Secret{
			Name: pd.Certs.DomainCerts.IotPlatformCertName,
			Data: pd.Certs.DomainCerts.SslCertCrt,
		}
		Secrets["iot_platform_cert"] = iotPlatformCertSecret

		iotPlatformKeySecret := pt.Secret{
			Name: pd.Certs.DomainCerts.IotPlatformKeyName,
			Data: pd.Certs.DomainCerts.PrivateKey,
		}
		Secrets["iot_platform_key"] = iotPlatformKeySecret

		if domainCertsType == "Certs provided by an CA" {
			iotPlatformCaCertSecret := pt.Secret{
				Name: pd.Certs.DomainCerts.IotPlatformCaName,
				Data: pd.Certs.DomainCerts.SslCaPem,
			}
			Secrets["iot_platform_ca_cert"] = iotPlatformCaCertSecret
		}
	}

	authCalloutSecretsDataArray := []string{
		fmt.Sprintf("DOMAIN_NAME=%s", pd.PlatformInfo.DomainName),
		fmt.Sprintf("ACCESS_TOKEN_SECRET=%s", pd.PlatformInfo.AccessTokenSecret),
		fmt.Sprintf("PG_HOST=%s", "postgres"),
		fmt.Sprintf("PG_PORT=%s", "5432"),
		fmt.Sprintf("PG_USERNAME=%s", pd.PlatformInfo.PostgresUser),
		fmt.Sprintf("PG_PASSWORD=%s", pd.PlatformInfo.PostgresPassword),
		fmt.Sprintf("PG_DBNAME=%s", pd.PlatformInfo.PostgresDB),
		fmt.Sprintf("NATS_HOST=%s", "nats1"),
		fmt.Sprintf("NATS_PORT=%s", "4222"),
		fmt.Sprintf("NATS_PROTOCOL=%s", "nats"),
		fmt.Sprintf("NATS_ADMIN_USERNAME=%s", pd.Certs.NatsCerts.NatsAdminUsername),
		fmt.Sprintf("NATS_ADMIN_PASSWORD=%s", pd.Certs.NatsCerts.NatsAdminPassword),
		fmt.Sprintf("NATS_ISSUER_SEED=%s", pd.Certs.NatsCerts.NatsIssuerSeed),
		fmt.Sprintf("NATS_XKEY_SEED=%s", pd.Certs.NatsCerts.NatsXKeySeed),
	}
	authCalloutSecretsData := strings.Join(authCalloutSecretsDataArray, "\n")
	authCalloutSecretsHash := utils.GetMD5Hash(authCalloutSecretsData)
	authCalloutSecretsName := fmt.Sprintf("authCallout_%s", authCalloutSecretsHash)
	authCalloutSecret := pt.Secret{
		Name: authCalloutSecretsName,
		Data: authCalloutSecretsData,
	}
	Secrets["auth_callout"] = authCalloutSecret

	Secrets["nats_config"] = CreateNatsConfigSecret(pd, numNatsReplicas)

	grafanaSecretsDataArray := []string{
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", pd.PlatformInfo.GrafanaAdminPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", pd.PlatformInfo.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", pd.PlatformInfo.NotificationsEmailPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_ADDRESS=%s", pd.PlatformInfo.NotificationsEmailAddress),
		fmt.Sprintf("POSTGRES_DB=%s", pd.PlatformInfo.PostgresDB),
		fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", pd.PlatformInfo.GrafanaDBPassword),
		fmt.Sprintf("TIMESCALE_DB=%s", pd.PlatformInfo.TimescaleDB),
		fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", pd.PlatformInfo.GrafanaDatasourcePassword),
	}
	grafanaSecretsData := strings.Join(grafanaSecretsDataArray, "\n")
	grafanaSecretsHash := utils.GetMD5Hash(grafanaSecretsData)
	grafanaSecretName := fmt.Sprintf("grafana_%s", grafanaSecretsHash)
	grafanaSecret := pt.Secret{
		Name: grafanaSecretName,
		Data: grafanaSecretsData,
	}
	Secrets["grafana"] = grafanaSecret

	postgresPassword := pd.PlatformInfo.PostgresPassword
	postgresPasswordHash := utils.GetMD5Hash(postgresPassword)
	postgresPasswordSecretName := fmt.Sprintf("postgres_password_%s", postgresPasswordHash)
	postgresPasswordSecret := pt.Secret{
		Name: postgresPasswordSecretName,
		Data: postgresPassword,
	}
	Secrets["postgres_password"] = postgresPasswordSecret

	postgresUser := pd.PlatformInfo.PostgresUser
	postgresUserHash := utils.GetMD5Hash(postgresUser)
	postgresUserSecretName := fmt.Sprintf("postgres_user_%s", postgresUserHash)
	postgresUserSecret := pt.Secret{
		Name: postgresUserSecretName,
		Data: postgresUser,
	}
	Secrets["postgres_user"] = postgresUserSecret

	postgresGrafana := fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", pd.PlatformInfo.GrafanaDBPassword)
	postgresGrafanaHash := utils.GetMD5Hash(postgresGrafana)
	postgresGrafanaSecretName := fmt.Sprintf("postgres_grafana_%s", postgresGrafanaHash)
	postgresGrafanaSecret := pt.Secret{
		Name: postgresGrafanaSecretName,
		Data: postgresGrafana,
	}
	Secrets["postgres_grafana"] = postgresGrafanaSecret

	timescalePassword := pd.PlatformInfo.TimescalePassword
	timescalePasswordHash := utils.GetMD5Hash(timescalePassword)
	timescalePasswordSecretName := fmt.Sprintf("timescale_password_%s", timescalePasswordHash)
	timescalePasswordSecret := pt.Secret{
		Name: timescalePasswordSecretName,
		Data: timescalePassword,
	}
	Secrets["timescale_password"] = timescalePasswordSecret

	timescaleUser := pd.PlatformInfo.TimescaleUser
	timescaleUserHash := utils.GetMD5Hash(timescaleUser)
	timescaleUserSecretName := fmt.Sprintf("timescale_user_%s", timescaleUserHash)
	timescaleUserSecret := pt.Secret{
		Name: timescaleUserSecretName,
		Data: timescaleUser,
	}
	Secrets["timescale_user"] = timescaleUserSecret

	timescaleGrafana := fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", pd.PlatformInfo.GrafanaDatasourcePassword)
	timescaleGrafanaHash := utils.GetMD5Hash(timescaleGrafana)
	timescaleGrafanaSecretName := fmt.Sprintf("timescale_grafana_%s", timescaleGrafanaHash)
	timescaleGrafanaSecret := pt.Secret{
		Name: timescaleGrafanaSecretName,
		Data: timescaleGrafana,
	}
	Secrets["timescale_grafana"] = timescaleGrafanaSecret

	timescaleDataRetInt := fmt.Sprintf("DATA_RETENTION_INTERVAL=%s", pd.PlatformInfo.TimescaleDataRetentionInterval)
	timescaleDataRetIntHash := utils.GetMD5Hash(timescaleDataRetInt)
	timescaleDataRetIntSecretName := fmt.Sprintf("timescale_data_ret_int_%s", timescaleDataRetIntHash)
	timescaleDataRetIntSecret := pt.Secret{
		Name: timescaleDataRetIntSecretName,
		Data: timescaleDataRetInt,
	}
	Secrets["timescale_data_ret_int"] = timescaleDataRetIntSecret

	if !slices.Contains(pd.PlatformInfo.ExcludedServices, "pipelines") {
		Secrets["pipelines_config"] = CreatePipelinesConfigSecret(pd, numNatsReplicas)
	}

	s3BucketType := pi.S3BucketType
	if s3BucketType == "Local Minio" && !slices.Contains(pd.PlatformInfo.ExcludedServices, "minio") {
		minioSecrets := []string{
			fmt.Sprintf("MINIO_ROOT_USER=%s", pd.PlatformInfo.PlatformAdminUserName),
			fmt.Sprintf("MINIO_ROOT_PASSWORD=%s", pd.PlatformInfo.PlatformAdminPassword),
		}
		minioSecretsData := strings.Join(minioSecrets, "\n")
		minioSecretsHash := utils.GetMD5Hash(minioSecretsData)
		minioSecretsName := fmt.Sprintf("minio_%s", minioSecretsHash)
		minioSecret := pt.Secret{
			Name: minioSecretsName,
			Data: minioSecretsData,
		}
		Secrets["minio"] = minioSecret
	}

	if !slices.Contains(pd.PlatformInfo.ExcludedServices, "pgadmin4") {
		pgadmin4Secrets := []string{
			fmt.Sprintf("PGADMIN_DEFAULT_EMAIL=%s", pd.PlatformInfo.PGAdminDefaultEmail),
			fmt.Sprintf("PGADMIN_DEFAULT_PASSWORD=%s", pd.PlatformInfo.PGAdminDefaultPassword),
			fmt.Sprintf("POSTGRES_USER=%s", pd.PlatformInfo.PostgresUser),
			fmt.Sprintf("TIMESCALE_USER=%s", pd.PlatformInfo.TimescaleUser),
		}
		pgadmin4SecretsData := strings.Join(pgadmin4Secrets, "\n")
		pgadmin4SecretsHash := utils.GetMD5Hash(pgadmin4SecretsData)
		pgadmin4SecretsName := fmt.Sprintf("pgadmin4_%s", pgadmin4SecretsHash)
		pgadmin4Secret := pt.Secret{
			Name: pgadmin4SecretsName,
			Data: pgadmin4SecretsData,
		}
		Secrets["pgadmin4"] = pgadmin4Secret
	}

	return Secrets
}

func GetSecretByName(dc *pt.DockerClient, secretName string) (*swarm.Secret, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing secrets: %v", err)
	}

	for _, s := range existingSecrets {
		if s.Spec.Name == secretName {
			return &s, nil
		}
	}

	return nil, nil
}

func CreateSecret(dc *pt.DockerClient, secret *pt.Secret) (string, error) {
	existing, err := GetSecretByName(dc, secret.Name)
	if err != nil {
		return "", fmt.Errorf("error checking existing secret '%s': %v", secret.Name, err)
	}
	if existing != nil {
		return existing.ID, nil
	}

	resp, err := dc.Cli.SecretCreate(dc.Ctx, swarm.SecretSpec{
		Annotations: swarm.Annotations{
			Name: secret.Name,
			Labels: map[string]string{
				"app": "osi4iot",
			},
		},
		Data: []byte(secret.Data),
	})
	if err != nil {
		return "", fmt.Errorf("error creating secret '%s': %v", secret.Name, err)
	}

	return resp.ID, nil
}

func CreateSecretByName(dc *pt.DockerClient, secret *pt.Secret) error {
	var secResp types.SecretCreateResponse
	secretExists, err := GetSecretByName(dc, secret.Name)
	if err != nil {
		return fmt.Errorf("error checking if secret exists: %v", err)
	}

	if secretExists == nil {
		secResp, err = dc.Cli.SecretCreate(dc.Ctx, swarm.SecretSpec{
			Annotations: swarm.Annotations{
				Name: secret.Name,
				Labels: map[string]string{
					"app": "osi4iot",
				},
			},
			Data: []byte(secret.Data),
		})
		if err != nil {
			return fmt.Errorf("error creating secret: %v", err)
		}
		secret.ID = secResp.ID
	}

	return nil
}

func RemoveSecretByName(dc *pt.DockerClient, secretName string) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing secrets: %v", err)
	}

	for _, s := range existingSecrets {
		if s.Spec.Name == secretName {
			err = dc.Cli.SecretRemove(dc.Ctx, s.ID)
			if err != nil {
				return fmt.Errorf("error removing secret: %v", err)
			}
			break
		}
	}

	return nil
}

func CreateSwarmSecrets(platformData *pt.PlatformData, dc *pt.DockerClient) (map[string]pt.Secret, error) {
	secretsToCreate := GenerateSecrets(platformData)
	createdSecrets := make(map[string]pt.Secret, len(secretsToCreate))

	for key, secret := range secretsToCreate {
		id, err := CreateSecret(dc, &secret)
		if err != nil {
			return nil, fmt.Errorf("error creating secret '%s': %v", key, err)
		}
		secret.ID = id
		createdSecrets[key] = secret
	}

	return createdSecrets, nil
}

// RemoveOrphanSecrets remove secrets de Docker that are considered "orphaned" based on the following criteria:
//
//	a) The secret's name starts with any of the knownSecretKeys (indicating it's managed by our platform).
//	b) The secret is not referenced by any of the active services (not in referencedSecretIDs).
func RemoveOrphanSecrets(
	dc *pt.DockerClient,
	activeServiceNames []string,
	knownSecretKeys []string,
) error {
	// 1. Collect all secret IDs referenced by active services
	referencedSecretIDs := make(map[string]struct{})
	for _, serviceName := range activeServiceNames {
		service, err := utils.GetSwarmServiceByName(dc, serviceName)
		if err != nil {
			return fmt.Errorf("error inspecting service '%s': %v", serviceName, err)
		}
		for _, ref := range service.Spec.TaskTemplate.ContainerSpec.Secrets {
			referencedSecretIDs[ref.SecretID] = struct{}{}
		}
	}

	// 2. List all Docker secrets that match any of the known prefixes
	allSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{})
	if err != nil {
		return fmt.Errorf("error listing secrets: %v", err)
	}

	// 3. Indetify and remove orphans
	// A secret is an orphan if:
	//   a) Its name starts with any knownSecretKey (it's ours)
	//   b) It's not in referencedSecretIDs (nobody uses it)
	var removalErrors []string
	for _, secret := range allSecrets {
		if !utils.HasKnownPrefix(secret.Spec.Name, knownSecretKeys) {
			continue // no es nuestro, ignorar
		}
		if _, isReferenced := referencedSecretIDs[secret.ID]; isReferenced {
			continue // in use, it's not an orphan
		}

		fmt.Printf("Removing orphan secret '%s'...\n", secret.Spec.Name)
		if err := dc.Cli.SecretRemove(dc.Ctx, secret.ID); err != nil {
			// Accumulate errors instead of stopping: we want to clean as much as possible
			removalErrors = append(removalErrors, fmt.Sprintf("'%s': %v", secret.Spec.Name, err))
		}
	}

	if len(removalErrors) > 0 {
		return fmt.Errorf("could not remove some orphan secrets:\n  - %s",
			strings.Join(removalErrors, "\n  - "))
	}

	return nil
}

func RemoveSwarmSecrets(dc *pt.DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing secrets: %v", err)
	}

	for _, s := range existingSecrets {
		err = dc.Cli.SecretRemove(dc.Ctx, s.ID)
		if err != nil {
			return fmt.Errorf("error removing secret: %v", err)
		}
	}

	return nil
}

func GetSecretByKey(dc *pt.DockerClient, secretKey string) (*pt.Secret, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing secrets: %v", err)
	}

	if len(existingSecrets) == 0 {
		return nil, fmt.Errorf("secret %s not found", secretKey)
	}

	var swarmSecret swarm.Secret
	for _, s := range existingSecrets {
		if strings.Contains(s.Spec.Name, secretKey) {
			swarmSecret = s
			break
		}
	}

	if swarmSecret.ID == "" {
		return nil, fmt.Errorf("secret %s not found", secretKey)
	}

	secret := &pt.Secret{
		ID:   swarmSecret.ID,
		Name: swarmSecret.Spec.Name,
		Data: string(swarmSecret.Spec.Data),
	}

	return secret, nil
}

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
		fmt.Sprintf("NATS_ADMIN_NKEY_PUBLIC=%s", pd.Certs.NatsCerts.NatsAdminNkeyPublic),
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

func CreateNatsConfigSecret(
	pd *pt.PlatformData,
	numNatsReplicas int,
) pt.Secret {
	clusterRoutes := []string{}
	for iNatsNode := 1; iNatsNode <= numNatsReplicas; iNatsNode++ {
		clusterRoutes = append(clusterRoutes, fmt.Sprintf("nats%d:6222", iNatsNode))
	}

	params := utils.NatsConfigParams{
		NatsAdminUsername:   pd.Certs.NatsCerts.NatsAdminUsername,
		NatsAdminPassword:   pd.Certs.NatsCerts.NatsAdminPassword,
		NatsAdminNkeyPublic: pd.Certs.NatsCerts.NatsAdminNkeyPublic,
		NatsIssuerPublicKey: pd.Certs.NatsCerts.NatsIssuerPublicKey,
		NatsXKeyPublicKey:   pd.Certs.NatsCerts.NatsXKeyPublicKey,
		ClusterRoutes:       clusterRoutes,
	}

	cfgStr, _ := utils.NatsRenderConfig(params)
	natsConfigHash := utils.GetMD5Hash(cfgStr)
	natsConfigName := fmt.Sprintf("nats_config_%s", natsConfigHash)
	natsConfigSecret := pt.Secret{
		Name: natsConfigName,
		Data: cfgStr,
	}

	return natsConfigSecret
}

func CreatePipelinesConfigSecret(
	pd *pt.PlatformData,
	numNatsReplicas int,
) pt.Secret {
	cfgStr, _ := utils.PipelinesConfig(pd, numNatsReplicas)
	pipelinesConfigHash := utils.GetMD5Hash(cfgStr)
	pipelinesConfigName := fmt.Sprintf("pipelines_config_%s", pipelinesConfigHash)
	pipelinesConfigSecret := pt.Secret{
		Name: pipelinesConfigName,
		Data: cfgStr,
	}

	return pipelinesConfigSecret
}

func CreateCertsSecrets(pd *pt.PlatformData, dc *pt.DockerClient) (map[string]pt.Secret, error) {
	domainCertsType := pd.PlatformInfo.DomainCertsType

	secretsToCreate := make(map[string]pt.Secret)
	if domainCertsType == "Certs provided by an CA" ||
		domainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		secretsToCreate["iot_platform_cert"] = pt.Secret{
			Name: pd.Certs.DomainCerts.IotPlatformCertName,
			Data: pd.Certs.DomainCerts.SslCertCrt,
		}
		secretsToCreate["iot_platform_key"] = pt.Secret{
			Name: pd.Certs.DomainCerts.IotPlatformKeyName,
			Data: pd.Certs.DomainCerts.PrivateKey,
		}
	}

	if len(secretsToCreate) == 0 {
		return nil, fmt.Errorf("unsupported domain certs type: %s", domainCertsType)
	}

	createdSecrets := make(map[string]pt.Secret, len(secretsToCreate))
	for key, secret := range secretsToCreate {
		id, err := CreateSecret(dc, &secret)
		if err != nil {
			return nil, fmt.Errorf("error creating secret '%s': %v", key, err)
		}
		secret.ID = id
		createdSecrets[key] = secret
	}

	return createdSecrets, nil
}

func GetKnownSecretKeys(pd *pt.PlatformData) []string {
	keys := []string{
		"iot_platform_cert",
		"iot_platform_key",
		"iot_platform_ca_cert",
		"admin_api",
		"auth_callout",
		"nats_config",
		"grafana",
		"postgres_password",
		"postgres_user",
		"postgres_grafana",
		"timescale_password",
		"timescale_user",
		"timescale_grafana",
		"timescale_data_ret_int",
		"pipelines_config",
		"minio",
		"pgadmin4",
	}
	return keys
}
