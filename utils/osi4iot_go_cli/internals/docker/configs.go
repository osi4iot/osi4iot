package docker

import (
	"fmt"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

type Config struct {
	Name string
	Data string
	ID   string
}

func GenerateConfigs(platformData *common.PlatformData) map[string]Config {
	Configs := make(map[string]Config)
	platformName := strings.Replace(platformData.PlatformInfo.PlatformName, " ", "_", -1)
	protocol := "https"
	if platformData.PlatformInfo.DomainCertsType == "No certs" {
		protocol = "http"
	}
	domainCertsType := platformData.PlatformInfo.DomainCertsType

	adminAPIConfigArray := []string{
		fmt.Sprintf("PLATFORM_NAME=%s", platformName),
		fmt.Sprintf("DOMAIN_NAME=%s", platformData.PlatformInfo.DomainName),
		fmt.Sprintf("PROTOCOL=%s", protocol),
		fmt.Sprintf("DEPLOYMENT_LOCATION=\"%s\"", platformData.PlatformInfo.DeploymentLocation),
		fmt.Sprintf("PLATFORM_PHRASE=\"%s\"", platformData.PlatformInfo.PlatformPhrase),
		fmt.Sprintf("MAIN_ORGANIZATION_NAME=\"%s\"", platformData.PlatformInfo.MainOrganizationName),
		fmt.Sprintf("MAIN_ORGANIZATION_ACRONYM=%s", platformData.PlatformInfo.MainOrganizationAcronym),
		fmt.Sprintf("MAIN_ORGANIZATION_ADDRESS1=\"%s\"", platformData.PlatformInfo.MainOrganizationAddress1),
		fmt.Sprintf("MAIN_ORGANIZATION_CITY=\"%s\"", platformData.PlatformInfo.MainOrganizationCity),
		fmt.Sprintf("MAIN_ORGANIZATION_ZIP_CODE=%s", platformData.PlatformInfo.MainOrganizationZipCode),
		fmt.Sprintf("MAIN_ORGANIZATION_STATE=\"%s\"", platformData.PlatformInfo.MainOrganizationState),
		fmt.Sprintf("MAIN_ORGANIZATION_COUNTRY=\"%s\"", platformData.PlatformInfo.MainOrganizationCountry),
		fmt.Sprintf("S3_BUCKET_TYPE=\"%s\"", platformData.PlatformInfo.S3BucketType),
		fmt.Sprintf("S3_BUCKET_NAME=%s", platformData.PlatformInfo.S3BucketName),
		fmt.Sprintf("AWS_REGION=%s", utils.AwsRegionsMap[platformData.PlatformInfo.AWSRegionS3Bucket]),
	}
	adminAPIConfig := strings.Join(adminAPIConfigArray, "\n")
	adminAPIConfigHash := utils.GetMD5Hash(adminAPIConfig)
	adminAPIConfigName := fmt.Sprintf("admin_api_%s", adminAPIConfigHash)
	Configs["admin_api"] = Config{
		Name: adminAPIConfigName,
		Data: adminAPIConfig,
	}

	mainOrgBuilding := platformData.PlatformInfo.MainOrganizationBuilding
	mainOrgBuildingHash := utils.GetMD5Hash(mainOrgBuilding)
	mainOrgBuildingName := fmt.Sprintf("main_org_building_%s", mainOrgBuildingHash)
	Configs["main_org_building"] = Config{
		Name: mainOrgBuildingName,
		Data: mainOrgBuilding,
	}

	mainOrgFloor := platformData.PlatformInfo.MainOrganizationFirstFloor
	mainOrgFloorHash := utils.GetMD5Hash(mainOrgFloor)
	mainOrgFloorName := fmt.Sprintf("main_org_floor_%s", mainOrgFloorHash)
	Configs["main_org_floor"] = Config{
		Name: mainOrgFloorName,
		Data: mainOrgFloor,
	}

	frontendConfigArray := []string{
		fmt.Sprintf("PLATFORM_NAME=%s", platformName),
		fmt.Sprintf("DOMAIN_NAME=%s",platformData.PlatformInfo.DomainName),
		fmt.Sprintf("PROTOCOL=%s", protocol),
		fmt.Sprintf("DEPLOYMENT_LOCATION=\"%s\"", platformData.PlatformInfo.DeploymentLocation),
		fmt.Sprintf("DEPLOYMENT_MODE=%s",platformData.PlatformInfo.DeploymentMode),
		fmt.Sprintf("MIN_LONGITUDE=%f", platformData.PlatformInfo.MinLongitude),
		fmt.Sprintf("MAX_LONGITUDE=%f", platformData.PlatformInfo.MaxLongitude),
		fmt.Sprintf("MIN_LATITUDE=%f", platformData.PlatformInfo.MinLatitude),
		fmt.Sprintf("MAX_LATITUDE=%f", platformData.PlatformInfo.MaxLatitude),
	}
	frontendConfig := strings.Join(frontendConfigArray, "\n")
	frontendConfigHash := utils.GetMD5Hash(frontendConfig)
	frontendConfigName := fmt.Sprintf("frontend_%s", frontendConfigHash)
	Configs["frontend"] = Config{
		Name: frontendConfigName,
		Data: frontendConfig,
	}

	grafanaConfigArray := []string{
		fmt.Sprintf("DOMAIN_NAME=%s", platformData.PlatformInfo.DomainName),
		fmt.Sprintf("DEFAULT_TIME_ZONE=%s", platformData.PlatformInfo.DefaultTimeZone),
		fmt.Sprintf("MAIN_ORGANIZATION_NAME=\"%s\"", platformData.PlatformInfo.MainOrganizationName),
		fmt.Sprintf("MAIN_ORGANIZATION_ACRONYM=%s", strings.Replace(platformData.PlatformInfo.MainOrganizationAcronym, " ", "_", -1)),
	}
	grafanaConfig := strings.Join(grafanaConfigArray, "\n")
	grafanaConfigHash := utils.GetMD5Hash(grafanaConfig)
	grafanaConfigName := fmt.Sprintf("grafana_%s", grafanaConfigHash)
	Configs["grafana"] = Config{
		Name: grafanaConfigName,
		Data: grafanaConfig,
	}

	mosquittoConfigArray := []string{
		"persistence true",
		"persistence_location /mosquitto/data",
		"log_type error",
		"log_type warning",
		"log_type notice",
		"log_type information",
		"log_dest stdout",
		" ",
		"# MQTT plain",
		"listener 1883",
		"protocol mqtt",
		"allow_anonymous false",
		" ",
		"# MQTT over TLS/SSL mTLS",
		"listener 8883",
		"protocol mqtt",
		"cafile /mosquitto/mqtt_certs/ca.crt",
		"certfile /mosquitto/mqtt_certs/server.crt",
		"keyfile /mosquitto/mqtt_certs/server.key",
		"require_certificate true",
		"use_identity_as_username true",
		" ",
		"# MQTT over TLS/SSL one-way TLS with CA",
		"listener 8884",
		"protocol mqtt",
		"allow_anonymous false",
		" ",
		"# WS for health check",
		"listener 8080 127.0.0.1",
		"protocol websockets",
		" ",
		"# MQTT over WSS",
		"listener 9001",
		"protocol websockets",
		"allow_anonymous false",
		" ",
		"include_dir /etc/mosquitto/conf.d",
	}
	mosquittoConfig := strings.Join(mosquittoConfigArray, "\n")
	mosquittoConfigHash := utils.GetMD5Hash(mosquittoConfig)
	mosquittoConfigName := fmt.Sprintf("mosquitto_%s", mosquittoConfigHash)
	Configs["mosquitto_conf"] = Config{
		Name: mosquittoConfigName,
		Data: mosquittoConfig,
	}

	mosquittoGoAuthArray := []string{
		"auth_plugin /mosquitto/go-auth.so",
		"auth_opt_log_level info",
		"auth_opt_log_dest stdout",
		"auth_opt_backends http",
		"auth_opt_disable_superuser true",
		"auth_opt_http_host admin_api",
		"auth_opt_http_port 3200",
		"auth_opt_http_getuser_uri /auth/mosquitto_user",
		"auth_opt_http_aclcheck_uri /auth/mosquitto_aclcheck",
		"auth_opt_http_method POST",
		" ",
		"auth_opt_cache true",
		"auth_opt_cache_type go-cache",
		"auth_opt_cache_reset true",
		"auth_opt_cache_refresh true",
		" ",
		"auth_opt_auth_cache_seconds 60",
		"auth_opt_acl_cache_seconds 60",
		"auth_opt_auth_jitter_seconds 5",
		"auth_opt_acl_jitter_seconds 5",
	}
	mosquittoGoAuth := strings.Join(mosquittoGoAuthArray, "\n")
	mosquittoGoAuthHash := utils.GetMD5Hash(mosquittoGoAuth)
	mosquittoGoAuthName := fmt.Sprintf("mosquitto_go_auth_%s", mosquittoGoAuthHash)
	Configs["mosquitto_go_auth"] = Config{
		Name: mosquittoGoAuthName,
		Data: mosquittoGoAuth,
	}

	s3StorageConfigArray := []string{
		fmt.Sprintf("DEPLOYMENT_LOCATION=\"%s\"", platformData.PlatformInfo.DeploymentLocation),
		fmt.Sprintf("DEFAULT_TIME_ZONE=%s", platformData.PlatformInfo.DefaultTimeZone),
		fmt.Sprintf("S3_BUCKET_TYPE=\"%s\"", platformData.PlatformInfo.S3BucketType),
		fmt.Sprintf("S3_BUCKET_NAME=%s", platformData.PlatformInfo.S3BucketName),
		fmt.Sprintf("AWS_REGION=%s", utils.AwsRegionsMap[platformData.PlatformInfo.AWSRegionS3Bucket]),
	}
	s3StorageConfig := strings.Join(s3StorageConfigArray, "\n")
	s3StorageConfigHash := utils.GetMD5Hash(s3StorageConfig)
	s3StorageConfigName := fmt.Sprintf("s3_storage_%s", s3StorageConfigHash)
	Configs["s3_storage"] = Config{
		Name: s3StorageConfigName,
		Data: s3StorageConfig,
	}

	if domainCertsType == "Certs provided by an CA" {
		traefikConfig := `
tls:
  certificates:
    - certFile: /run/secrets/iot_platform_cert.cer
      keyFile: /run/secrets/iot_platform.key
  options:
    default:
      minVersion: VersionTLS12
      cipherSuites:
        - TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
        - TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
        - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
        - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
        - TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256
        - TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256
`
		traefikConfigHash := utils.GetMD5Hash(traefikConfig)
		traefikConfigName := fmt.Sprintf("traefik_%s", traefikConfigHash)
		Configs["traefik"] = Config{
			Name: traefikConfigName,
			Data: traefikConfig,
		}

	} else if domainCertsType[:19] == "Let's encrypt certs" {
		traefikConfig := `
tls:
  options:
    default:
      minVersion: VersionTLS12
      cipherSuites:
        - TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
        - TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
        - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
        - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
        - TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256
        - TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256
`
		traefikConfigHash := utils.GetMD5Hash(traefikConfig)
		traefikConfigName := fmt.Sprintf("traefik_%s", traefikConfigHash)
		Configs["traefik"] = Config{
			Name: traefikConfigName,
			Data: traefikConfig,
		}

	}

	return Configs
}

func createConfig(dc *DockerClient, configKey string, config *Config) error {
	existingConfigs, err := dc.Cli.ConfigList(dc.Ctx, types.ConfigListOptions{})
	if err != nil {
		return fmt.Errorf("error listing configs: %v", err)
	}

	configExists := false
	for _, c := range existingConfigs {
		if c.Spec.Name == config.Name {
			configExists = true
			config.ID = c.ID
			break
		} else if c.Spec.Name != config.Name && c.Spec.Name[:len(configKey)] == configKey {
			configExists = false
			err = dc.Cli.ConfigRemove(dc.Ctx, c.ID)
			if err != nil {
				return fmt.Errorf("error removing config: %v", err)
			}
			break
		}
	}

	if !configExists {
		configResp, err := dc.Cli.ConfigCreate(dc.Ctx, swarm.ConfigSpec{
			Annotations: swarm.Annotations{
				Name: config.Name,
				Labels: map[string]string{
					"app": "osi4iot",
				},
			},
			Data: []byte(config.Data),
		})
		if err != nil {
			return fmt.Errorf("error creating config: %v", err)
		}
		config.ID = configResp.ID
	}

	return nil
}

func createSwarmConfigs(platformData *common.PlatformData, dc *DockerClient) (map[string]Config, error) {
	configs := GenerateConfigs(platformData)
	for key, config := range configs {
		err := createConfig(dc, key, &config)
		if err != nil {
			return nil, fmt.Errorf("error creating config %s: %v", key, err)
		}
		configs[key] = config
	}

	return configs, nil
}

func removeSwarmConfigs(dc *DockerClient) error {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingConfigs, err := dc.Cli.ConfigList(dc.Ctx, types.ConfigListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing configs: %v", err)
	}

	for _, c := range existingConfigs {
		err = dc.Cli.ConfigRemove(dc.Ctx, c.ID)
		if err != nil {
			return fmt.Errorf("error removing config: %v", err)
		}
	}

	return nil
}
