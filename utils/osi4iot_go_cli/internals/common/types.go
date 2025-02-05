package common

type PlatformData struct {
	PlatformInfo       PlatformInfo  `json:"platformInfo"`
	Certs              Certs         `json:"certs"`
	AdminAPISecretName string        `json:"admin_api_secret_name"`
	CustomServices     []interface{} `json:"custom_services"`
}

type PlatformInfo struct {
	DockerImagesVersion        string     `json:"DOCKER_IMAGES_VERSION"`
	DeploymentMode             string     `json:"DEPLOYMENT_MODE"`
	DeploymentLocation         string     `json:"DEPLOYMENT_LOCATION"`
	S3BucketType               string     `json:"S3_BUCKET_TYPE"`
	AWSAccessKeyIDRoute53      string     `json:"AWS_ACCESS_KEY_ID_ROUTE_53"`
	AWSSecretAccessKeyRoute53  string     `json:"AWS_SECRET_ACCESS_KEY_ROUTE_53"`
	AWSRegionRoute53           string     `json:"AWS_REGION_ROUTE_53"`
	AWSHostedZoneIdRoute53     string     `json:"AWS_HOSTED_ZONE_ID_ROUTE_53"`
	AWSAccessKeyIDS3Bucket     string     `json:"AWS_ACCESS_KEY_ID_S3_BUCKET"`
	AWSSecretAccessKeyS3Bucket string     `json:"AWS_SECRET_ACCESS_KEY_S3_BUCKET"`
	AWSRegionS3Bucket          string     `json:"AWS_REGION_S3_BUCKET"`
	S3BucketName               string     `json:"S3_BUCKET_NAME"`
	PlatformName               string     `json:"PLATFORM_NAME"`
	DomainName                 string     `json:"DOMAIN_NAME"`
	DomainCertsType            string     `json:"DOMAIN_CERTS_TYPE"`
	PlatformPhrase             string     `json:"PLATFORM_PHRASE"`
	PlatformAdminFirstName     string     `json:"PLATFORM_ADMIN_FIRST_NAME"`
	PlatformAdminSurname       string     `json:"PLATFORM_ADMIN_SURNAME"`
	PlatformAdminUserName      string     `json:"PLATFORM_ADMIN_USER_NAME"`
	PlatformAdminEmail         string     `json:"PLATFORM_ADMIN_EMAIL"`
	PlatformAdminPassword      string     `json:"PLATFORM_ADMIN_PASSWORD"`
	RAMMemoryPerNode           string     `json:"RAM_MEMORY_PER_NODE"`
	NumberOfCPUsPerNode        string     `json:"NUMBER_OF_CPUS_PER_NODE"`
	NumberOfSwarmNodes         int        `json:"NUMBER_OF_SWARM_NODES"`
	NodesData                  []NodeData `json:"NODES_DATA"`

	MinLongitude    float64 `json:"MIN_LONGITUDE"`
	MaxLongitude    float64 `json:"MAX_LONGITUDE"`
	MinLatitude     float64 `json:"MIN_LATITUDE"`
	MaxLatitude     float64 `json:"MAX_LATITUDE"`
	DefaultTimeZone string  `json:"DEFAULT_TIME_ZONE"`

	MainOrganizationName               string `json:"MAIN_ORGANIZATION_NAME"`
	MainOrganizationAcronym            string `json:"MAIN_ORGANIZATION_ACRONYM"`
	MainOrganizationAddress1           string `json:"MAIN_ORGANIZATION_ADDRESS1"`
	MainOrganizationCity               string `json:"MAIN_ORGANIZATION_CITY"`
	MainOrganizationZipCode            string `json:"MAIN_ORGANIZATION_ZIP_CODE"`
	MainOrganizationState              string `json:"MAIN_ORGANIZATION_STATE"`
	MainOrganizationCountry            string `json:"MAIN_ORGANIZATION_COUNTRY"`
	MainOrganizationBuildingPath       string `json:"MAIN_ORGANIZATION_BUILDING_PATH"`
	MainOrganizationBuilding           string `json:"MAIN_ORGANIZATION_BUILDING"`
	MainOrganizationFirstFloorPath     string `json:"MAIN_ORGANIZATION_FLOOR_PATH"`
	MainOrganizationFirstFloor         string `json:"MAIN_ORGANIZATION_FLOOR"`
	TelegramBotToken                   string `json:"TELEGRAM_BOTTOKEN"`
	MainOrganizationTelegramChatID     string `json:"MAIN_ORGANIZATION_TELEGRAM_CHAT_ID"`
	MainOrganizationTelegramInviteLink string `json:"MAIN_ORGANIZATION_TELEGRAM_INVITATION_LINK"`

	NumberOfNodeRedInstancesInMainOrg int    `json:"NUMBER_OF_NODERED_INSTANCES_IN_MAIN_ORG"`
	NotificationsEmailUser            string `json:"NOTIFICATIONS_EMAIL_USER"`
	NotificationsEmailAddress         string `json:"NOTIFICATIONS_EMAIL_ADDRESS"`
	NotificationsEmailPassword        string `json:"NOTIFICATIONS_EMAIL_PASSWORD"`

	RegistrationTokenLifetime int    `json:"REGISTRATION_TOKEN_LIFETIME"`
	RefreshTokenLifetime      int    `json:"REFRESH_TOKEN_LIFETIME"`
	RefreshTokenSecret        string `json:"REFRESH_TOKEN_SECRET"`
	AccessTokenSecret         string `json:"ACCESS_TOKEN_SECRET"`
	AccessTokenLifetime       int    `json:"ACCESS_TOKEN_LIFETIME"`

	MQTTSslCertsValidityDays int    `json:"MQTT_SSL_CERTS_VALIDITY_DAYS"`
	FloatingIPAddress        string `json:"FLOATING_IP_ADDRES"`
	NetworkInterface         string `json:"NETWORK_INTERFACE"`
	EncryptionSecretKey      string `json:"ENCRYPTION_SECRET_KEY"`
	GrafanaAdminPassword     string `json:"GRAFANA_ADMIN_PASSWORD"`

	PostgresUser     string `json:"POSTGRES_USER"`
	PostgresPassword string `json:"POSTGRES_PASSWORD"`
	PostgresDB       string `json:"POSTGRES_DB"`

	TimescaleUser                  string `json:"TIMESCALE_USER"`
	TimescalePassword              string `json:"TIMESCALE_PASSWORD"`
	TimescaleDB                    string `json:"TIMESCALE_DB"`
	TimescaleDataRetentionInterval string `json:"TIMESCALE_DATA_RET_INT_DAYS"`
	GrafanaDBPassword              string `json:"GRAFANA_DB_PASSWORD"`
	GrafanaDatasourcePassword      string `json:"GRAFANA_DATASOURCE_PASSWORD"`
	Dev2PDBPassword                string `json:"DEV2PDB_PASSWORD"`
	NodeRedAdmin                   string `json:"NODE_RED_ADMIN"`
	NodeRedAdminHash               string `json:"NODE_RED_ADMIN_HASH"`
	PGAdminDefaultEmail            string `json:"PGADMIN_DEFAULT_EMAIL"`
	PGAdminDefaultPassword         string `json:"PGADMIN_DEFAULT_PASSWORD"`

	// Keys used for AWS Cluster deployment
	AwsSshKeyPath string `json:"AWS_SSH_KEY_PATH"`
	AwsSshKey     string `json:"AWS_SSH_KEY"`

	// Keys used for On-premise Cluster deployment
	SshPrivKeyPath string `json:"SSH_PRIVATE_KEY_PATH"`
	SshPrivKey     string `json:"SSH_PRIVATE_KEY"`
	SshPubKeyPath  string `json:"SSH_PUB_KEY_PATH"`
	SshPubKey      string `json:"SSH_PUB_KEY"`

	AwsEfsDNS string `json:"AWS_EFS_DNS"`

	DOMAIN_SSL_PRIVATE_KEY_PATH string `json:"DOMAIN_SSL_PRIVATE_KEY_PATH"`
	DOMAIN_SSL_CA_PEM_PATH      string `json:"DOMAIN_SSL_CA_PEM_PATH"`
	DOMAIN_SSL_CERT_CRT_PATH    string `json:"DOMAIN_SSL_CERT_CRT_PATH"`
}

type Certs struct {
	DomainCerts DomainCerts `json:"domain_certs"`
	MqttCerts   MqttCerts   `json:"mqtt_certs"`
}

type DomainCerts struct {
	PrivateKey                 string `json:"private_key"`
	IotPlatformKeyName         string `json:"iot_platform_key_name"`
	SslCaPem                   string `json:"ssl_ca_pem"`
	IotPlatformCaName          string `json:"iot_platform_ca_name"`
	SslCertCrt                 string `json:"ssl_cert_crt"`
	IotPlatformCertName        string `json:"iot_platform_cert_name"`
	CaPemExpirationTimestamp   int64  `json:"ca_pem_expiration_timestamp"`
	CertCrtExpirationTimestamp int64  `json:"cert_crt_expiration_timestamp"`
}

type MqttCerts struct {
	CaCerts       CaCerts        `json:"ca_certs"`
	Broker        Broker         `json:"broker"`
	Organizations []Organization `json:"organizations"`
}

type CaCerts struct {
	CaCrt               string `json:"ca_crt"`
	MqttCertsCaCertName string `json:"mqtt_certs_ca_cert_name"`
	CaKey               string `json:"ca_key"`
	MqttCertsCaKeyName  string `json:"mqtt_certs_ca_key_name"`
	ExpirationTimestamp int64  `json:"expiration_timestamp"`
}

type Broker struct {
	ServerCrt           string `json:"server_crt"`
	MqttBrokerCertName  string `json:"mqtt_broker_cert_name"`
	ServerKey           string `json:"server_key"`
	MqttBrokerKeyName   string `json:"mqtt_broker_key_name"`
	ExpirationTimestamp int64  `json:"expiration_timestamp"`
}

type Organization struct {
	OrgHash              string            `json:"org_hash"`
	OrgAcronym           string            `json:"org_acronym"`
	ExclusiveWorkerNodes []string          `json:"exclusiveWorkerNodes"` // Ajustar si se conoce la estructura
	NodeRedInstances     []NodeRedInstance `json:"nodered_instances"`
}

type NodeRedInstance struct {
	ClientCrt           string `json:"client_crt"`
	ClientKey           string `json:"client_key"`
	ExpirationTimestamp int64  `json:"expiration_timestamp"`
	NriHash             string `json:"nri_hash"`
	IsVolumeCreated     string `json:"is_volume_created"`
	ClientCrtName       string `json:"client_crt_name"`
	ClientKeyName       string `json:"client_key_name"`
}

type NodeData struct {
	NodeId       string `json:"nodeId"`
	NodeHostName string `json:"nodeHostName"`
	NodeIP       string `json:"nodeIP"`
	NodeUserName string `json:"nodeUserName"`
	NodeRole     string `json:"nodeRole"`
	NodeArch     string `json:"nodeArch"`
	NodePassword string `json:"nodePassword"`
}
