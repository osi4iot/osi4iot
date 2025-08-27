package data

import (
	"strconv"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

var Data *pt.PlatformData = &pt.PlatformData{}

type PlatformStatus int

const (
	Unknown PlatformStatus = iota
	Empty
	Initiating
	Running
	Stopped
	Deleted
	CreatingOrg
)

var PlatformState PlatformStatus = Empty

func SetData(key string, value string) {
	switch key {
	case "PLATFORM_NAME":
		Data.PlatformInfo.PlatformName = value
	case "DOMAIN_NAME":
		Data.PlatformInfo.DomainName = value
	case "PLATFORM_PHRASE":
		Data.PlatformInfo.PlatformPhrase = value
	case "PLATFORM_ADMIN_FIRST_NAME":
		Data.PlatformInfo.PlatformAdminFirstName = value
	case "PLATFORM_ADMIN_SURNAME":
		Data.PlatformInfo.PlatformAdminSurname = value
	case "PLATFORM_ADMIN_USER_NAME":
		Data.PlatformInfo.PlatformAdminUserName = value
	case "PLATFORM_ADMIN_EMAIL":
		Data.PlatformInfo.PlatformAdminEmail = value
	case "PLATFORM_ADMIN_PASSWORD":
		Data.PlatformInfo.PlatformAdminPassword = value
	case "MIN_LONGITUDE":
		minLong, _ := strconv.ParseFloat(value, 64)
		Data.PlatformInfo.MinLongitude = minLong
	case "MAX_LONGITUDE":
		maxLong, _ := strconv.ParseFloat(value, 64)
		Data.PlatformInfo.MaxLongitude = maxLong
	case "MIN_LATITUDE":
		minLat, _ := strconv.ParseFloat(value, 64)
		Data.PlatformInfo.MinLatitude = minLat
	case "MAX_LATITUDE":
		maxLat, _ := strconv.ParseFloat(value, 64)
		Data.PlatformInfo.MaxLatitude = maxLat
	case "DEFAULT_TIME_ZONE":
		Data.PlatformInfo.DefaultTimeZone = value
	case "MAIN_ORGANIZATION_NAME":
		Data.PlatformInfo.MainOrganizationName = value
	case "MAIN_ORGANIZATION_ACRONYM":
		Data.PlatformInfo.MainOrganizationAcronym = value
	case "MAIN_ORGANIZATION_ADDRESS1":
		Data.PlatformInfo.MainOrganizationAddress1 = value
	case "MAIN_ORGANIZATION_CITY":
		Data.PlatformInfo.MainOrganizationCity = value
	case "MAIN_ORGANIZATION_ZIP_CODE":
		Data.PlatformInfo.MainOrganizationZipCode = value
	case "MAIN_ORGANIZATION_STATE":
		Data.PlatformInfo.MainOrganizationState = value
	case "MAIN_ORGANIZATION_COUNTRY":
		Data.PlatformInfo.MainOrganizationCountry = value
	case "MAIN_ORGANIZATION_BUILDING_PATH":
		Data.PlatformInfo.MainOrganizationBuildingPath = value
		if utils.FileExists(value) {
			mainOrgBuilding := utils.GetFileData(value)
			Data.PlatformInfo.MainOrganizationBuilding = mainOrgBuilding
		}
	case "MAIN_ORGANIZATION_FLOOR_PATH":
		Data.PlatformInfo.MainOrganizationFirstFloorPath = value
		if utils.FileExists(value) {
			mainOrgFloor := utils.GetFileData(value)
			Data.PlatformInfo.MainOrganizationFirstFloor = mainOrgFloor
		}
	case "TELEGRAM_BOTTOKEN":
		Data.PlatformInfo.TelegramBotToken = value
	case "MAIN_ORGANIZATION_TELEGRAM_CHAT_ID":
		Data.PlatformInfo.MainOrganizationTelegramChatID = value
	case "MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK":
		Data.PlatformInfo.MainOrganizationTelegramInviteLink = value
	case "NUMBER_OF_NODERED_INSTANCES_IN_MAIN_ORG":
		nrInstances, _ := strconv.Atoi(value)
		Data.PlatformInfo.NumberOfNodeRedInstancesInMainOrg = nrInstances
	case "NOTIFICATIONS_EMAIL_USER":
		Data.PlatformInfo.NotificationsEmailUser = value
	case "NOTIFICATIONS_EMAIL_ADDRESS":
		Data.PlatformInfo.NotificationsEmailAddress = value
	case "NOTIFICATIONS_EMAIL_PASSWORD":
		Data.PlatformInfo.NotificationsEmailPassword = value
	case "LLM_PROVIDER_URL":
		Data.PlatformInfo.LlmProviderUrl = value
	case "LLM_PROVIDER_API_KEY":
		Data.PlatformInfo.LlmProviderApiKey = value
	case "REGISTRATION_TOKEN_LIFETIME":
		regTokenLifetime, _ := strconv.Atoi(value)
		Data.PlatformInfo.RegistrationTokenLifetime = regTokenLifetime
	case "ACCESS_TOKEN_LIFETIME":
		accessTokenLifetime, _ := strconv.Atoi(value)
		Data.PlatformInfo.AccessTokenLifetime = accessTokenLifetime
	case "REFRESH_TOKEN_LIFETIME":
		refreshTokenLifetime, _ := strconv.Atoi(value)
		Data.PlatformInfo.RefreshTokenLifetime = refreshTokenLifetime
	case "REFRESH_TOKEN_SECRET":
		if Data.PlatformInfo.RefreshTokenSecret == "" {
			Data.PlatformInfo.RefreshTokenSecret = value
		}
	case "ACCESS_TOKEN_SECRET":
		if Data.PlatformInfo.AccessTokenSecret == "" {
			Data.PlatformInfo.AccessTokenSecret = value
		}
	case "MESSAGING_SYSTEM":
		Data.PlatformInfo.MessagingSystem = value
	case "MQTT_SSL_CERTS_VALIDITY_DAYS":
		mqttCertsValidityDays, _ := strconv.Atoi(value)
		Data.PlatformInfo.MQTTSslCertsValidityDays = mqttCertsValidityDays
	case "NUM_NATS_CLUSTER_NODES":
		numNatsClusterNodes, _ := strconv.Atoi(value)
		Data.PlatformInfo.NumNatsClusterNodes = numNatsClusterNodes
	case "DEPLOYMENT_LOCATION":
		Data.PlatformInfo.DeploymentLocation = value
	case "LOCAL_RESOURCE_UTILIZATION_PERCENTAGE":
		localResourceUtilization, _ := strconv.Atoi(value)
		Data.PlatformInfo.LocalResourceUtilization = localResourceUtilization
	case "DEPLOYMENT_MODE":
		Data.PlatformInfo.DeploymentMode = value
	case "MESSAGING_SVC_RESOURCES":
		Data.PlatformInfo.MessagingSvcResources = value
	case "IOT_DATA_STORAGE_SVC_RESOURCES":
		Data.PlatformInfo.IotDataStorageSvcResources = value
	case "ADMIN_DATA_STORAGE_SVC_RESOURCES":
		Data.PlatformInfo.AdminDataStorageSvcResources = value
	case "UI_SVC_RESOURCES":
		Data.PlatformInfo.UiSvcResources = value
	case "PIPELINES_SVC_RESOURCES":
		Data.PlatformInfo.PipelinesSvcResources = value
	case "NUMBER_OF_SWARM_NODES":
		numberOfNodes, _ := strconv.Atoi(value)
		Data.PlatformInfo.NumberOfSwarmNodes = numberOfNodes
		if len(Data.PlatformInfo.NodesData) == 0 {
			Data.PlatformInfo.NodesData = make([]pt.NodeData, numberOfNodes)
		}
	case "S3_BUCKET_TYPE":
		Data.PlatformInfo.S3BucketType = value
	case "S3_BUCKET_NAME":
		Data.PlatformInfo.S3BucketName = value
	case "DOMAIN_CERTS_TYPE":
		Data.PlatformInfo.DomainCertsType = value
	case "AWS_ACCESS_KEY_ID_ROUTE_53":
		Data.PlatformInfo.AWSAccessKeyIDRoute53 = value
	case "AWS_SECRET_ACCESS_KEY_ROUTE_53":
		Data.PlatformInfo.AWSSecretAccessKeyRoute53 = value
	case "AWS_REGION_ROUTE_53":
		Data.PlatformInfo.AWSRegionRoute53 = value
	case "AWS_HOSTED_ZONE_ID_ROUTE_53":
		Data.PlatformInfo.AWSHostedZoneIdRoute53 = value
	case "AWS_ACCESS_KEY_ID_S3_BUCKET":
		Data.PlatformInfo.AWSAccessKeyIDS3Bucket = value
	case "AWS_SECRET_ACCESS_KEY_S3_BUCKET":
		Data.PlatformInfo.AWSSecretAccessKeyS3Bucket = value
	case "AWS_REGION_S3_BUCKET":
		Data.PlatformInfo.AWSRegionS3Bucket = value
	case "AWS_SSH_KEY_PATH":
		Data.PlatformInfo.AwsSshKeyPath = value
		if utils.FileExists(value) {
			awsSshKey := utils.GetFileData(value)
			Data.PlatformInfo.AwsSshKey = awsSshKey
		}
	case "AWS_EFS_DNS":
		Data.PlatformInfo.AwsEfsDNS = value
	case "FLOATING_IP_ADDRES":
		Data.PlatformInfo.FloatingIPAddress = value
	case "NETWORK_INTERFACE":
		Data.PlatformInfo.NetworkInterface = value
	case "DOMAIN_SSL_PRIVATE_KEY_PATH":
		Data.PlatformInfo.DOMAIN_SSL_PRIVATE_KEY_PATH = value
		if utils.FileExists(value) {
			domainSSLPrivateKey := utils.GetFileData(value)
			Data.Certs.DomainCerts.PrivateKey = domainSSLPrivateKey
		}
	case "DOMAIN_SSL_CA_PEM_PATH":
		Data.PlatformInfo.DOMAIN_SSL_CA_PEM_PATH = value
		if utils.FileExists(value) {
			domainSSLCaPem := utils.GetFileData(value)
			Data.Certs.DomainCerts.SslCaPem = domainSSLCaPem
		}
	case "DOMAIN_SSL_CERT_CRT_PATH":
		Data.PlatformInfo.DOMAIN_SSL_CERT_CRT_PATH = value
		if utils.FileExists(value) {
			domainSSLCertCrt := utils.GetFileData(value)
			Data.Certs.DomainCerts.SslCertCrt = domainSSLCertCrt
		}
	case "ENCRYPTION_SECRET_KEY":
		if Data.PlatformInfo.EncryptionSecretKey == "" {
			Data.PlatformInfo.EncryptionSecretKey = value
		}
	case "GRAFANA_ADMIN_PASSWORD":
		Data.PlatformInfo.GrafanaAdminPassword = value
	case "POSTGRES_USER":
		Data.PlatformInfo.PostgresUser = value
	case "POSTGRES_PASSWORD":
		Data.PlatformInfo.PostgresPassword = value
	case "POSTGRES_DB":
		Data.PlatformInfo.PostgresDB = value
	case "TIMESCALE_USER":
		Data.PlatformInfo.TimescaleUser = value
	case "TIMESCALE_PASSWORD":
		Data.PlatformInfo.TimescalePassword = value
	case "TIMESCALE_DB":
		Data.PlatformInfo.TimescaleDB = value
	case "TIMESCALE_DATA_RET_INT_DAYS":
		timescaleDataRetentionInterval := value + " days"
		Data.PlatformInfo.TimescaleDataRetentionInterval = timescaleDataRetentionInterval
	case "NUMBER_DEV2PDB_WORKERS":
		numberDev2pdbWorkers, _ := strconv.Atoi(value)
		Data.PlatformInfo.NumberDev2pdbWorkers = numberDev2pdbWorkers
	case "DEV2PDB_BATCH_SIZE":
		dev2pdbBatchSize, _ := strconv.Atoi(value)
		Data.PlatformInfo.Dev2pdbBatchSize = dev2pdbBatchSize
	case "GRAFANA_DB_PASSWORD":
		if Data.PlatformInfo.GrafanaDBPassword == "" {
			Data.PlatformInfo.GrafanaDBPassword = value
		}
	case "GRAFANA_DATASOURCE_PASSWORD":
		if Data.PlatformInfo.GrafanaDatasourcePassword == "" {
			Data.PlatformInfo.GrafanaDatasourcePassword = value
		}
	case "DEV2PDB_PASSWORD":
		Data.PlatformInfo.Dev2pdbPassword = value
	case "DEV2PDB_NATS_NKEY_PUBLIC":
		Data.PlatformInfo.Dev2pdbNatsNkeyPublic = value
	case "DEV2PDB_NATS_NKEY_SEED":
		Data.PlatformInfo.Dev2pdbNatsNkeySeed = value
	case "NODE_RED_ADMIN":
		Data.PlatformInfo.NodeRedAdmin = value
	case "NODE_RED_ADMIN_HASH":
		Data.PlatformInfo.NodeRedAdminHash = value
	case "PGADMIN_DEFAULT_EMAIL":
		Data.PlatformInfo.PGAdminDefaultEmail = value
	case "PGADMIN_DEFAULT_PASSWORD":
		Data.PlatformInfo.PGAdminDefaultPassword = value
	case "IOT_PLATFORM_KEY_NAME":
		Data.Certs.DomainCerts.IotPlatformKeyName = value
	case "iot_platform_ca_name":
		Data.Certs.DomainCerts.IotPlatformCaName = value
	case "iot_platform_cert_name":
		Data.Certs.DomainCerts.IotPlatformCertName = value
	case "DOCKER_IMAGES_VERSION":
		Data.PlatformInfo.DockerImagesVersion = value
	}

	keyWords := strings.Split(key, "_")
	firstWord := keyWords[0]
	if firstWord == "Node" && len(keyWords) > 2 {
		nodeIndex, _ := strconv.Atoi(keyWords[1])
		nodeData := pt.NodeData{}
		if len(Data.PlatformInfo.NodesData) == nodeIndex {
			Data.PlatformInfo.NodesData = append(Data.PlatformInfo.NodesData, nodeData)
		}
		switch keyWords[2] {
		case "Label":
			Data.PlatformInfo.NodesData[nodeIndex-1].NodeLabel = value
		case "HostName":
			Data.PlatformInfo.NodesData[nodeIndex-1].NodeHostName = value
		case "IP":
			Data.PlatformInfo.NodesData[nodeIndex-1].NodeIP = value
		case "UserName":
			Data.PlatformInfo.NodesData[nodeIndex-1].NodeUserName = value
		case "Role":
			Data.PlatformInfo.NodesData[nodeIndex-1].NodeRole = value
		case "Password":
			Data.PlatformInfo.NodesData[nodeIndex-1].NodePassword = value
		}
	}
}

func SetNodesData(nodesData []pt.NodeData) {
	Data.PlatformInfo.NodesData = nodesData
}

func SetPlatformState(state PlatformStatus) {
	PlatformState = state
}

func GetPlatformState() PlatformStatus {
	return PlatformState
}

func GetData() *pt.PlatformData {
	return Data
}
