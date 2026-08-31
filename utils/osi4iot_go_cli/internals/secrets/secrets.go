package secrets

import (
	"fmt"
	"maps"
	"slices"
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

	pgHost := "postgres"
	pgPort := "5432"
	if pi.UsePatroniTool {
		pgHost = "haproxy_patroni"
		pgPort = "5000"
	}

	authCalloutSecretsDataArray := []string{
		fmt.Sprintf("DOMAIN_NAME=%s", pd.PlatformInfo.DomainName),
		fmt.Sprintf("ACCESS_TOKEN_SECRET=%s", pd.PlatformInfo.AccessTokenSecret),
		fmt.Sprintf("PG_HOST=%s", pgHost),
		fmt.Sprintf("PG_PORT=%s", pgPort),
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
		fmt.Sprintf("VECTOR_NATS_NKEY_PUBLIC=%s", pd.Certs.NatsCerts.VectorNKeyPublic),
		fmt.Sprintf("ADMIN_API_NATS_NKEY_PUBLIC=%s", pd.Certs.NatsCerts.AdminApiNKeyPublic),
		fmt.Sprintf("PIPELINES_NATS_NKEY_PUBLIC=%s", pd.Certs.NatsCerts.PipelinesNKeyPublic),
		fmt.Sprintf("DEPLOY_CLI_NATS_NKEY_PUBLIC=%s", pd.Certs.NatsCerts.DeployCliNKeyPublic),
		fmt.Sprintf("SYSTEM_MANAGER_NATS_NKEY_PUBLIC=%s", pd.Certs.NatsCerts.SystemManagerNKeyPublic),
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

	grafanaPostgresHost := "postgres"
	grafanaPostgresPort := "5432"
	grafanaTimescaleHost := "timescaledb"
	grafanaTimescalePort := "5432"
	if pi.UsePatroniTool {
		grafanaPostgresHost = "haproxy_patroni"
		grafanaPostgresPort = "5000"
		grafanaTimescaleHost = "haproxy_patroni"
		grafanaTimescalePort = "5101"
	}

	grafanaSecretsDataArray := []string{
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", pi.GrafanaAdminPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", pi.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", pi.NotificationsEmailPassword),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_ADDRESS=%s", pi.NotificationsEmailAddress),
		fmt.Sprintf("POSTGRES_DB=%s", pi.PostgresDB),
		fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", pi.GrafanaDBPassword),
		fmt.Sprintf("POSTGRES_HOST=%s", grafanaPostgresHost),
		fmt.Sprintf("POSTGRES_PORT=%s", grafanaPostgresPort),
		fmt.Sprintf("TIMESCALE_HOST=%s", grafanaTimescaleHost),
		fmt.Sprintf("TIMESCALE_PORT=%s", grafanaTimescalePort),
		fmt.Sprintf("TIMESCALE_DB=%s", pi.TimescaleDB),
		fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", pi.GrafanaDatasourcePassword),
	}
	grafanaSecretsData := strings.Join(grafanaSecretsDataArray, "\n")
	grafanaSecretsHash := utils.GetMD5Hash(grafanaSecretsData)
	grafanaSecretName := fmt.Sprintf("grafana_%s", grafanaSecretsHash)
	grafanaSecret := pt.Secret{
		Name: grafanaSecretName,
		Data: grafanaSecretsData,
	}
	Secrets["grafana"] = grafanaSecret

	if !slices.Contains(pi.ExcludedServices, "pipelines") {
		Secrets["pipelines_config"] = CreatePipelinesConfigSecret(pd, numNatsReplicas)
	}

	timescalePassword := pi.TimescalePassword
	if pi.UsePatroniTool {
		patroniSecrets := createPatroniSecrets(pd)
		maps.Copy(Secrets, patroniSecrets)
	} else {
		postgresSecretsDataArray := []string{
			fmt.Sprintf("POSTGRES_USER=%s", pi.PostgresUser),
			fmt.Sprintf("POSTGRES_PASSWORD=%s", pi.PostgresPassword),
			fmt.Sprintf("GRAFANA_DB_PASSWORD=%s", pi.GrafanaDBPassword),
			fmt.Sprintf("SUPERADMIN_USER=%s", pi.PlatformAdminUserName),
			fmt.Sprintf("SUPERADMIN_PASSWORD=%s", pi.PlatformAdminPassword),
		}
		postgresSecretsData := strings.Join(postgresSecretsDataArray, "\n")
		postgresSecretsHash := utils.GetMD5Hash(postgresSecretsData)
		Secrets["postgres"] = pt.Secret{
			Name: fmt.Sprintf("postgres_%s", postgresSecretsHash),
			Data: postgresSecretsData,
		}

		timescaleUser := pi.TimescaleUser
		timescaledbSecretsDataArray := []string{
			fmt.Sprintf("POSTGRES_USER=%s", timescaleUser),
			fmt.Sprintf("POSTGRES_PASSWORD=%s", timescalePassword),
			fmt.Sprintf("GRAFANA_DATASOURCE_PASSWORD=%s", pi.GrafanaDatasourcePassword),
			fmt.Sprintf("DATA_RETENTION_INTERVAL=%s", utils.ShellQuote(pi.TimescaleDataRetentionInterval)),
			fmt.Sprintf("SUPERADMIN_USER=%s", pi.PlatformAdminUserName),
			fmt.Sprintf("SUPERADMIN_PASSWORD=%s", pi.PlatformAdminPassword),
		}
		timescaledbSecretsData := strings.Join(timescaledbSecretsDataArray, "\n")
		timescaledbSecretsHash := utils.GetMD5Hash(timescaledbSecretsData)
		Secrets["timescaledb"] = pt.Secret{
			Name: fmt.Sprintf("timescaledb_%s", timescaledbSecretsHash),
			Data: timescaledbSecretsData,
		}
	}

	s3BucketType := pi.S3BucketType
	if s3BucketType == "Local Minio" && !slices.Contains(pi.ExcludedServices, "minio") {
		minioSecrets := []string{
			fmt.Sprintf("MINIO_ROOT_USER=%s", pi.PlatformAdminUserName),
			fmt.Sprintf("MINIO_ROOT_PASSWORD=%s", pi.PlatformAdminPassword),
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

	if !slices.Contains(pi.ExcludedServices, "pgadmin4") {
		pgUser := pi.PlatformAdminUserName
		tsUser := pi.PlatformAdminUserName
		pgadmin4Secrets := []string{
			fmt.Sprintf("PGADMIN_DEFAULT_EMAIL=%s", pi.PGAdminDefaultEmail),
			fmt.Sprintf("PGADMIN_DEFAULT_PASSWORD=%s", pi.PGAdminDefaultPassword),
			fmt.Sprintf("POSTGRES_USER=%s", pgUser),
			fmt.Sprintf("TIMESCALE_USER=%s", tsUser),
			fmt.Sprintf("POSTGRES_HOST=%s", grafanaPostgresHost),
			fmt.Sprintf("POSTGRES_PORT=%s", grafanaPostgresPort),
			fmt.Sprintf("TIMESCALE_HOST=%s", grafanaTimescaleHost),
			fmt.Sprintf("TIMESCALE_PORT=%s", grafanaTimescalePort),
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

	vectorSecretsDataArray := []string{
		fmt.Sprintf("DB_PASS=%s", timescalePassword),
		fmt.Sprintf("NATS_NKEY_PUB=%s", pd.Certs.NatsCerts.VectorNKeyPublic),
		fmt.Sprintf("NATS_NKEY_SEED=%s", pd.Certs.NatsCerts.VectorNKeySeed),
	}
	vectorSecretsData := strings.Join(vectorSecretsDataArray, "\n")
	vectorSecretsHash := utils.GetMD5Hash(vectorSecretsData)
	vectorSecretName := fmt.Sprintf("vector_%s", vectorSecretsHash)
	vectorSecret := pt.Secret{
		Name: vectorSecretName,
		Data: vectorSecretsData,
	}
	Secrets["vector_credentials"] = vectorSecret

	if pi.UsePatroniTool || pi.DomainCertsType == "Let's encrypt certs with DNS-01 challenge and AWS Route 53 provider" {
		Secrets["system_manager"] = CreateSystemManagerSecrets(pd)
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
