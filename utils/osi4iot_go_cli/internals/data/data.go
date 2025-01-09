package data

import (
	"bytes"
	"fmt"
	"os"
	"strconv"
	"strings"
)

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
	AwsSshKeyPath string `json:"AWS_SSH_KEY_PATH_ROUTE_53"`
	AwsSshKey     string `json:"AWS_SSH_KEY_ROUTE_53"`

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

type NodeData struct {
	NodeHostName string `json:"nodeHostName"`
	NodeIP       string `json:"nodeIP"`
	NodeUserName string `json:"nodeUserName"`
	NodeRole     string `json:"nodeRole"`
	NodeArch     string `json:"nodeArch"`
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

func GetFileData(filePath string) string {
	file, _ := os.Open(filePath)
	defer file.Close()

	buf := new(bytes.Buffer)
	buf.ReadFrom(file)
	return buf.String()
}

var Data PlatformData = PlatformData{}

type PlatformStatus int

const (
	Unknown PlatformStatus = iota
	Empty
	Initiating
	Running
	Stopped
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
		mainOrgBuilding := GetFileData(value)
		Data.PlatformInfo.MainOrganizationBuilding = mainOrgBuilding
	case "MAIN_ORGANIZATION_FLOOR_PATH":
		Data.PlatformInfo.MainOrganizationFirstFloorPath = value
		mainOrgFloor := GetFileData(value)
		Data.PlatformInfo.MainOrganizationFirstFloor = mainOrgFloor
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
	case "MQTT_SSL_CERTS_VALIDITY_DAYS":
		mqttCertsValidityDays, _ := strconv.Atoi(value)
		Data.PlatformInfo.MQTTSslCertsValidityDays = mqttCertsValidityDays
	case "DEPLOYMENT_LOCATION":
		Data.PlatformInfo.DeploymentLocation = value
	case "DEPLOYMENT_MODE":
		Data.PlatformInfo.DeploymentMode = value
	case "NUMBER_OF_SWARM_NODES":
		numberOfNodes, _ := strconv.Atoi(value)
		Data.PlatformInfo.NodesData = make([]NodeData, numberOfNodes)
	case "NUMBER_OF_CPUS_PER_NODE":
		Data.PlatformInfo.NumberOfCPUsPerNode = value
	case "RAM_MEMORY_PER_NODE":
		Data.PlatformInfo.RAMMemoryPerNode = value
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
	case "AWS_ACCESS_KEY_ID_S3_BUCKET":
		Data.PlatformInfo.AWSAccessKeyIDS3Bucket = value
	case "AWS_SECRET_ACCESS_KEY_S3_BUCKET":
		Data.PlatformInfo.AWSSecretAccessKeyS3Bucket = value
	case "AWS_REGION_S3_BUCKET":
		Data.PlatformInfo.AWSRegionS3Bucket = value
	case "AWS_SSH_KEY_PATH":
		Data.PlatformInfo.AwsSshKeyPath = value
	case "AWS_EFS_DNS":
		Data.PlatformInfo.AwsEfsDNS = value
	case "FLOATING_IP_ADDRES":
		Data.PlatformInfo.FloatingIPAddress = value
	case "NETWORK_INTERFACE":
		Data.PlatformInfo.NetworkInterface = value
	case "DOMAIN_SSL_PRIVATE_KEY_PATH":
		Data.PlatformInfo.DOMAIN_SSL_PRIVATE_KEY_PATH = value
		domainSSLPrivateKey := GetFileData(value)
		Data.Certs.DomainCerts.PrivateKey = domainSSLPrivateKey
	case "DOMAIN_SSL_CA_PEM_PATH":
		Data.PlatformInfo.DOMAIN_SSL_CA_PEM_PATH = value
		domainSSLCaPem := GetFileData(value)
		Data.Certs.DomainCerts.SslCaPem = domainSSLCaPem
	case "DOMAIN_SSL_CERT_CRT_PATH":
		Data.PlatformInfo.DOMAIN_SSL_CERT_CRT_PATH = value
		domainSSLCertCrt := GetFileData(value)
		Data.Certs.DomainCerts.SslCertCrt = domainSSLCertCrt
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
	case "GRAFANA_DB_PASSWORD":
		if Data.PlatformInfo.GrafanaDBPassword == "" {
			Data.PlatformInfo.GrafanaDBPassword = value
		}
	case "GRAFANA_DATASOURCE_PASSWORD":
		if Data.PlatformInfo.GrafanaDatasourcePassword == "" {
			Data.PlatformInfo.GrafanaDatasourcePassword = value
		}
	case "DEV2PDB_PASSWORD":
		Data.PlatformInfo.Dev2PDBPassword = value
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

	firstWord := strings.Split(key, "_")[0]
	if firstWord == "NODE" {
		nodeIndex, _ := strconv.Atoi(strings.Split(key, "_")[1])
		switch strings.Split(key, "_")[2] {
		case "HOSTNAME":
			Data.PlatformInfo.NodesData[nodeIndex].NodeHostName = value
		case "IP":
			Data.PlatformInfo.NodesData[nodeIndex].NodeIP = value
		case "USERNAME":
			Data.PlatformInfo.NodesData[nodeIndex].NodeUserName = value
		case "ROLE":
			Data.PlatformInfo.NodesData[nodeIndex].NodeRole = value
		case "ARCH":
			Data.PlatformInfo.NodesData[nodeIndex].NodeArch = value
		}
	}
}

func SetNodesData(nodesData []NodeData) {
	Data.PlatformInfo.NodesData = nodesData
}

func SetCertsData() {
	keyHash := GetMD5Hash(Data.Certs.DomainCerts.PrivateKey)
	Data.Certs.DomainCerts.IotPlatformKeyName = fmt.Sprintf("iot_platform_key_%s", keyHash)

	caHash := GetMD5Hash(Data.Certs.DomainCerts.SslCaPem)
	Data.Certs.DomainCerts.IotPlatformCaName = fmt.Sprintf("iot_platform_ca_%s", caHash)
	caExpirationTimestamp := GetCertExpirationTimestamp(Data.Certs.DomainCerts.SslCaPem)
	Data.Certs.DomainCerts.CaPemExpirationTimestamp = caExpirationTimestamp

	certHash := GetMD5Hash(Data.Certs.DomainCerts.SslCertCrt)
	Data.Certs.DomainCerts.IotPlatformCertName = fmt.Sprintf("iot_platform_cert_%s", certHash)
	certExpirationTimestamp := GetCertExpirationTimestamp(Data.Certs.DomainCerts.SslCertCrt)
	Data.Certs.DomainCerts.CertCrtExpirationTimestamp = certExpirationTimestamp
}

func GetData() PlatformData {
	return Data
}
