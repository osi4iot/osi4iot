package docker

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
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
	mainOrgNodeRedInstances := platformData.Organizations[0].NodeRedInstances
	var hashes []string
	var nriPasswords []string
	var nriNkeysPublic []string
	for _, nri := range mainOrgNodeRedInstances {
		hashes = append(hashes, nri.NriHash)
		nriPasswords = append(nriPasswords, nri.NriPassword)
		nriNkeysPublic = append(nriNkeysPublic, nri.NriNatsCerts.NriNkeyPublic)
	}
	mainOrgNriHashes := strings.Join(hashes, ",")
	mainOrgNriPasswords := strings.Join(nriPasswords, ",")
	mainOrgNriNkeysPublic := strings.Join(nriNkeysPublic, ",")
	domainCertsType := platformData.PlatformInfo.DomainCertsType
	messagingSystem := platformData.PlatformInfo.MessagingSystem
	nodeRoleNumMap := getNodeRoleNumMap(platformData)

	adminApiSecretsDataArray := []string{
		fmt.Sprintf("REGISTRATION_TOKEN_LIFETIME=%s", strconv.Itoa(platformData.PlatformInfo.RegistrationTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_LIFETIME=%s", strconv.Itoa(platformData.PlatformInfo.RefreshTokenLifetime)),
		fmt.Sprintf("REFRESH_TOKEN_SECRET=%s", platformData.PlatformInfo.RefreshTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_SECRET=%s", platformData.PlatformInfo.AccessTokenSecret),
		fmt.Sprintf("ACCESS_TOKEN_LIFETIME=%s", strconv.Itoa(platformData.PlatformInfo.AccessTokenLifetime)),
		fmt.Sprintf("MQTT_SSL_CERTS_VALIDITY_DAYS=%s", strconv.Itoa(platformData.PlatformInfo.MQTTSslCertsValidityDays)),
		fmt.Sprintf("ENCRYPTION_SECRET_KEY=%s", platformData.PlatformInfo.EncryptionSecretKey),
		fmt.Sprintf("PLATFORM_ADMIN_FIRST_NAME=\"%s\"", platformData.PlatformInfo.PlatformAdminFirstName),
		fmt.Sprintf("PLATFORM_ADMIN_SURNAME=\"%s\"", platformData.PlatformInfo.PlatformAdminSurname),
		fmt.Sprintf("PLATFORM_ADMIN_USER_NAME=%s", platformData.PlatformInfo.PlatformAdminUserName),
		fmt.Sprintf("PLATFORM_ADMIN_EMAIL=%s", platformData.PlatformInfo.PlatformAdminEmail),
		fmt.Sprintf("PLATFORM_ADMIN_PASSWORD=%s", platformData.PlatformInfo.PlatformAdminPassword),
		fmt.Sprintf("PLATFORM_ADMIN_NATS_PUBLIC=%s", platformData.PlatformInfo.PlatformAdminNatsPublicKey),
		fmt.Sprintf("GRAFANA_ADMIN_PASSWORD=%s", platformData.PlatformInfo.GrafanaAdminPassword),
		fmt.Sprintf("POSTGRES_USER=%s", platformData.PlatformInfo.PostgresUser),
		fmt.Sprintf("POSTGRES_PASSWORD=%s", platformData.PlatformInfo.PostgresPassword),
		fmt.Sprintf("POSTGRES_DB=%s", platformData.PlatformInfo.PostgresDB),
		fmt.Sprintf("TIMESCALE_USER=%s", platformData.PlatformInfo.TimescaleUser),
		fmt.Sprintf("TIMESCALE_PASSWORD=%s", platformData.PlatformInfo.TimescalePassword),
		fmt.Sprintf("TIMESCALE_DB=%s", platformData.PlatformInfo.TimescaleDB),
		fmt.Sprintf("DEV2PDB_PASSWORD=%s", platformData.PlatformInfo.Dev2pdbPassword),
		fmt.Sprintf("DEV2PDB_NATS_NKEY_PUBLIC=%s", platformData.PlatformInfo.Dev2pdbNatsNkeyPublic),
		fmt.Sprintf("NATS_ADMIN_USERNAME=%s", platformData.Certs.NatsCerts.NatsAdminUsername),
		fmt.Sprintf("NATS_ADMIN_PASSWORD=%s", platformData.Certs.NatsCerts.NatsAdminPassword),
		fmt.Sprintf("NATS_ADMIN_NKEY_PUBLIC=%s", platformData.Certs.NatsCerts.NatsAdminNkeyPublic),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_USER=%s", platformData.PlatformInfo.NotificationsEmailUser),
		fmt.Sprintf("NOTIFICATIONS_EMAIL_PASSWORD=%s", platformData.PlatformInfo.NotificationsEmailPassword),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_CHAT_ID=%s", platformData.PlatformInfo.MainOrganizationTelegramChatID),
		fmt.Sprintf("MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK=%s", platformData.PlatformInfo.MainOrganizationTelegramInviteLink),
		fmt.Sprintf("TELEGRAM_BOTTOKEN=%s", platformData.PlatformInfo.TelegramBotToken),
		fmt.Sprintf("MAIN_ORG_HASH=%s", platformData.Organizations[0].OrgHash),
		fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", platformData.PlatformInfo.AWSAccessKeyIDS3Bucket),
		fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", platformData.PlatformInfo.AWSSecretAccessKeyS3Bucket),
		fmt.Sprintf("MAIN_ORG_NRI_HASHES=%s", mainOrgNriHashes),
		fmt.Sprintf("MAIN_ORG_NRI_PASSWORDS=%s", mainOrgNriPasswords),
		fmt.Sprintf("MAIN_ORG_NRI_NKEYS_PUBLIC=%s", mainOrgNriNkeysPublic),
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

		iotPlatformCaCertSecret := Secret{
			Name: platformData.Certs.DomainCerts.IotPlatformCaName,
			Data: platformData.Certs.DomainCerts.SslCaPem,
		}
		Secrets["iot_platform_ca_cert"] = iotPlatformCaCertSecret
	}

	if messagingSystem == "mqtt" {
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
	} else if messagingSystem == "nats" {
		authCalloutSecretsDataArray := []string{
			fmt.Sprintf("DOMAIN_NAME=%s", platformData.PlatformInfo.DomainName),
			fmt.Sprintf("ACCESS_TOKEN_SECRET=%s", platformData.PlatformInfo.AccessTokenSecret),
			fmt.Sprintf("PG_HOST=%s", "postgres"),
			fmt.Sprintf("PG_PORT=%s", "5432"),
			fmt.Sprintf("PG_USERNAME=%s", platformData.PlatformInfo.PostgresUser),
			fmt.Sprintf("PG_PASSWORD=%s", platformData.PlatformInfo.PostgresPassword),
			fmt.Sprintf("PG_DBNAME=%s", platformData.PlatformInfo.PostgresDB),
			fmt.Sprintf("NATS_HOST=%s", "nats1"),
			fmt.Sprintf("NATS_PORT=%s", "4222"),
			fmt.Sprintf("NATS_PROTOCOL=%s", "nats"),
			fmt.Sprintf("NATS_ADMIN_USERNAME=%s", platformData.Certs.NatsCerts.NatsAdminUsername),
			fmt.Sprintf("NATS_ADMIN_PASSWORD=%s", platformData.Certs.NatsCerts.NatsAdminPassword),
			fmt.Sprintf("NATS_ISSUER_SEED=%s", platformData.Certs.NatsCerts.NatsIssuerSeed),
			fmt.Sprintf("NATS_XKEY_SEED=%s", platformData.Certs.NatsCerts.NatsXKeySeed),
		}
		authCalloutSecretsData := strings.Join(authCalloutSecretsDataArray, "\n")
		authCalloutSecretsHash := utils.GetMD5Hash(authCalloutSecretsData)
		authCalloutSecretsName := fmt.Sprintf("authCallout_%s", authCalloutSecretsHash)
		authCalloutSecret := Secret{
			Name: authCalloutSecretsName,
			Data: authCalloutSecretsData,
		}
		Secrets["auth_callout"] = authCalloutSecret

		clusterRoutes := []string{"nats1:6222"}
		if nodeRoleNumMap["Platform worker"] >= 3 {
			clusterRoutes = append(clusterRoutes, "nats2:6222")
			clusterRoutes = append(clusterRoutes, "nats3:6222")
		}
		params := utils.NatsConfigParams{
			NatsAdminUsername:   platformData.Certs.NatsCerts.NatsAdminUsername,
			NatsAdminPassword:   platformData.Certs.NatsCerts.NatsAdminPassword,
			NatsAdminNkeyPublic: platformData.Certs.NatsCerts.NatsAdminNkeyPublic,
			NatsIssuerPublicKey: platformData.Certs.NatsCerts.NatsIssuerPublicKey,
			NatsXKeyPublicKey:   platformData.Certs.NatsCerts.NatsXKeyPublicKey,
			ClusterRoutes:       clusterRoutes,
		}

		cfgStr, _ := utils.NatsRenderConfig(params)
		natsConfigHash := utils.GetMD5Hash(cfgStr)
		natsConfigName := fmt.Sprintf("nats_config_%s", natsConfigHash)
		natsConfigSecret := Secret{
			Name: natsConfigName,
			Data: cfgStr,
		}
		Secrets["nats_config"] = natsConfigSecret
	}

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

	dev2pdbCfgStr, _ := utils.Dev2pdbConfig(platformData, nodeRoleNumMap)
	dev2pdbConfigHash := utils.GetMD5Hash(dev2pdbCfgStr)
	dev2pdbConfigName := fmt.Sprintf("dev2pdb_config_%s", dev2pdbConfigHash)
	dev2pdbConfigSecret := Secret{
		Name: dev2pdbConfigName,
		Data: dev2pdbCfgStr,
	}
	Secrets["dev2pdb_config"] = dev2pdbConfigSecret

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

	generateNriSecrets(messagingSystem, platformData.Organizations, Secrets)

	return Secrets
}

func generateNriSecrets(messagingSystem string, orgs []common.Organization, Secrets map[string]Secret) {
	for iorg := range orgs {
		orgAcronym := strings.ToLower(orgs[iorg].OrgAcronym)
		numNodeRedInstances := len(orgs[iorg].NodeRedInstances)
		for inri := range numNodeRedInstances {
			nriHash := orgs[iorg].NodeRedInstances[inri].NriHash
			if messagingSystem == "mqtt" {
				mqttClientCertSecretKey := fmt.Sprintf("%s_%s_cert", orgAcronym, nriHash)
				mqttClientCertSecret := Secret{
					Name: orgs[iorg].NodeRedInstances[inri].NriMqttCerts.ClientCrtName,
					Data: orgs[iorg].NodeRedInstances[inri].NriMqttCerts.ClientCrt,
				}
				Secrets[mqttClientCertSecretKey] = mqttClientCertSecret

				mqttClientKeySecretKey := fmt.Sprintf("%s_%s_key", orgAcronym, nriHash)
				mqttClientKeySecret := Secret{
					Name: orgs[iorg].NodeRedInstances[inri].NriMqttCerts.ClientKeyName,
					Data: orgs[iorg].NodeRedInstances[inri].NriMqttCerts.ClientKey,
				}
				Secrets[mqttClientKeySecretKey] = mqttClientKeySecret
			} else if messagingSystem == "nats" {
				nriUserName := orgs[iorg].NodeRedInstances[inri].NriUserName
				if nriUserName == "" {
					nriUserName = fmt.Sprintf("nri_%s", nriHash)
					orgs[iorg].NodeRedInstances[inri].NriUserName = nriUserName
				}
				nriPassword := orgs[iorg].NodeRedInstances[inri].NriPassword
				if nriPassword == "" {
					nriPassword = utils.GeneratePassword(20)
					orgs[iorg].NodeRedInstances[inri].NriPassword = nriPassword
				}
				nriNatsPublic := orgs[iorg].NodeRedInstances[inri].NriNatsCerts.NriNkeyPublic
				nriNatsSeed := orgs[iorg].NodeRedInstances[inri].NriNatsCerts.NriNkeySeed
				if nriNatsPublic == "" && nriNatsSeed == "" {
					nriNatsPublic, nriNatsSeed, _ := utils.CreateUserNatsNkey()
					orgs[iorg].NodeRedInstances[inri].NriNatsCerts.NriNkeyPublic = nriNatsPublic
					orgs[iorg].NodeRedInstances[inri].NriNatsCerts.NriNkeySeed = nriNatsSeed
				} else {
					nriNatsSeed = orgs[iorg].NodeRedInstances[inri].NriNatsCerts.NriNkeySeed
				}
				
				nriNatsSecrets := []string{
					fmt.Sprintf("NRI_USERNAME=%s", nriUserName),
					fmt.Sprintf("NRI_PASSWORD=%s", nriPassword),
					fmt.Sprintf("NATS_NKEY_SEED=%s", nriNatsSeed),
				}
				
				nriNatsSecretsData := strings.Join(nriNatsSecrets, "\n")
				nriNatsSecretsHash := utils.GetMD5Hash(nriNatsSecretsData)
				nriNatsSecretsKey := fmt.Sprintf("%s_%s_nats", orgAcronym, nriHash)
				nriNatsSecretsName := fmt.Sprintf("%s_%s", nriNatsSecretsKey, nriNatsSecretsHash)
				nriNatsSecret := Secret{
					Name: nriNatsSecretsName,
					Data: nriNatsSecretsData,
				}
				Secrets[nriNatsSecretsKey] = nriNatsSecret
			}
		}
	}
}

func createSecret(dc *DockerClient, secretKey string, secret *Secret) error {
	existingSecrets, err := dc.Cli.SecretList(dc.Ctx, types.SecretListOptions{})
	if err != nil {
		return fmt.Errorf("error listing secrets: %v", err)
	}

	secretExists := false
	for _, s := range existingSecrets {
		if s.Spec.Name == secret.Name {
			secretExists = true
			secret.ID = s.ID
			break
		} else if s.Spec.Name != secret.Name && s.Spec.Name[:len(secretKey)] == secretKey {
			secretExists = false
			err = dc.Cli.SecretRemove(dc.Ctx, s.ID)
			if err != nil {
				return fmt.Errorf("error removing secret: %v", err)
			}
			break
		}
	}

	if !secretExists {
		secResp, err := dc.Cli.SecretCreate(dc.Ctx, swarm.SecretSpec{
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

func createSwarmSecrets(platformData *common.PlatformData, dc *DockerClient) (map[string]Secret, error) {
	secrets := GenerateSecrets(platformData)
	for key, secret := range secrets {
		err := createSecret(dc, key, &secret)
		if err != nil {
			return nil, fmt.Errorf("error creating secret %s: %v", key, err)
		}
		secrets[key] = secret
	}

	return secrets, nil
}

func removeSwarmSecrets(dc *DockerClient) error {
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
