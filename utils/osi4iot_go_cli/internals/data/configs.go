package data

import (
	"fmt"
	"strings"
)

type Config struct {
	Name string
	Data string
	ID   string
}

func GenerateConfigs() map[string]Config {
	Configs := make(map[string]Config)
	platformName := strings.Replace(Data.PlatformInfo.PlatformName, " ", "_", -1)
	protocol := "https"
	if Data.PlatformInfo.DomainCertsType == "No certs" {
		protocol = "http"
	}
	adminAPIConfigArray := []string{
		fmt.Sprintf("PLATFORM_NAME=%s", platformName),
		fmt.Sprintf("DOMAIN_NAME=%s", Data.PlatformInfo.DomainName),
		fmt.Sprintf("PROTOCOL=%s", protocol),
		fmt.Sprintf("DEPLOYMENT_LOCATION=\"%s\"", Data.PlatformInfo.DeploymentLocation),
		fmt.Sprintf("PLATFORM_PHRASE=\"%s\"", Data.PlatformInfo.PlatformPhrase),
		fmt.Sprintf("MAIN_ORGANIZATION_NAME=\"%s\"", Data.PlatformInfo.MainOrganizationName),
		fmt.Sprintf("MAIN_ORGANIZATION_ACRONYM=%s", Data.PlatformInfo.MainOrganizationAcronym),
		fmt.Sprintf("MAIN_ORGANIZATION_ADDRESS1=\"%s\"", Data.PlatformInfo.MainOrganizationAddress1),
		fmt.Sprintf("MAIN_ORGANIZATION_CITY=\"%s\"", Data.PlatformInfo.MainOrganizationCity),
		fmt.Sprintf("MAIN_ORGANIZATION_ZIP_CODE=%s", Data.PlatformInfo.MainOrganizationZipCode),
		fmt.Sprintf("MAIN_ORGANIZATION_STATE=\"%s\"", Data.PlatformInfo.MainOrganizationState),
		fmt.Sprintf("MAIN_ORGANIZATION_COUNTRY=\"%s\"", Data.PlatformInfo.MainOrganizationCountry),
		fmt.Sprintf("S3_BUCKET_TYPE=\"%s\"", Data.PlatformInfo.S3BucketType),
		fmt.Sprintf("S3_BUCKET_NAME=%s", Data.PlatformInfo.S3BucketName),
		fmt.Sprintf("AWS_REGION=%s", Data.PlatformInfo.AWSRegion),
	}
	adminAPIConfig := strings.Join(adminAPIConfigArray, "\n")
	adminAPIConfigHash := GetMD5Hash(adminAPIConfig)
	adminAPIConfigName := fmt.Sprintf("admin_api_%s", adminAPIConfigHash)
	Configs["admin_api"] = Config{
		Name: adminAPIConfigName,
		Data: adminAPIConfig,
	}

	mainOrgBuilding := Data.PlatformInfo.MainOrganizationBuilding
	mainOrgBuildingHash := GetMD5Hash(mainOrgBuilding)
	mainOrgBuildingName := fmt.Sprintf("main_org_building_%s", mainOrgBuildingHash)
	Configs["main_org_building"] = Config{
		Name: mainOrgBuildingName,
		Data: mainOrgBuilding,
	}

	mainOrgFloor := Data.PlatformInfo.MainOrganizationFirstFloor
	mainOrgFloorHash := GetMD5Hash(mainOrgFloor)
	mainOrgFloorName := fmt.Sprintf("main_org_floor_%s", mainOrgFloorHash)
	Configs["main_org_floor"] = Config{
		Name: mainOrgFloorName,
		Data: mainOrgFloor,
	}

	frontendConfigArray := []string{
		fmt.Sprintf("PLATFORM_NAME=%s", platformName),
		fmt.Sprintf("DOMAIN_NAME=%s", Data.PlatformInfo.DomainName),
		fmt.Sprintf("PROTOCOL=%s", protocol),
		fmt.Sprintf("DEPLOYMENT_LOCATION=\"%s\"", Data.PlatformInfo.DeploymentLocation),
		fmt.Sprintf("DEPLOYMENT_MODE=%s", Data.PlatformInfo.DeploymentMode),
		fmt.Sprintf("MIN_LONGITUDE=%f", Data.PlatformInfo.MinLongitude),
		fmt.Sprintf("MAX_LONGITUDE=%f", Data.PlatformInfo.MaxLongitude),
		fmt.Sprintf("MIN_LATITUDE=%f", Data.PlatformInfo.MinLatitude),
		fmt.Sprintf("MAX_LATITUDE=%f", Data.PlatformInfo.MaxLatitude),
	}
	frontendConfig := strings.Join(frontendConfigArray, "\n")
	frontendConfigHash := GetMD5Hash(frontendConfig)
	frontendConfigName := fmt.Sprintf("frontend_%s", frontendConfigHash)
	Configs["frontend"] = Config{
		Name: frontendConfigName,
		Data: frontendConfig,
	}

	grafanaConfigArray := []string{
		fmt.Sprintf("DOMAIN_NAME=%s", Data.PlatformInfo.DomainName),
		fmt.Sprintf("DEFAULT_TIME_ZONE=%s", Data.PlatformInfo.DefaultTimeZone),
		fmt.Sprintf("MAIN_ORGANIZATION_NAME=\"%s\"", Data.PlatformInfo.MainOrganizationName),
		fmt.Sprintf("MAIN_ORGANIZATION_ACRONYM=%s", strings.Replace(Data.PlatformInfo.MainOrganizationAcronym, " ", "_", -1)),
	}
	grafanaConfig := strings.Join(grafanaConfigArray, "\n")
	grafanaConfigHash := GetMD5Hash(grafanaConfig)
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
		"# MQTT over TLS/SSL",
		"listener 8883",
		"protocol mqtt",
		"cafile /mosquitto/mqtt_certs/ca.crt",
		"certfile /mosquitto/mqtt_certs/server.crt",
		"keyfile /mosquitto/mqtt_certs/server.key",
		"require_certificate true",
		"use_identity_as_username true",
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
	mosquittoConfigHash := GetMD5Hash(mosquittoConfig)
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
	mosquittoGoAuthHash := GetMD5Hash(mosquittoGoAuth)
	mosquittoGoAuthName := fmt.Sprintf("mosquitto_go_auth_%s", mosquittoGoAuthHash)
	Configs["mosquitto_go_auth"] = Config{
		Name: mosquittoGoAuthName,
		Data: mosquittoGoAuth,
	}

	s3StorageConfigArray := []string{
		fmt.Sprintf("DEPLOYMENT_LOCATION=\"%s\"", Data.PlatformInfo.DeploymentLocation),
		fmt.Sprintf("DEFAULT_TIME_ZONE=%s", Data.PlatformInfo.DefaultTimeZone),
		fmt.Sprintf("S3_BUCKET_TYPE=\"%s\"", Data.PlatformInfo.S3BucketType),
		fmt.Sprintf("S3_BUCKET_NAME=%s", Data.PlatformInfo.S3BucketName),
		fmt.Sprintf("AWS_REGION=%s", Data.PlatformInfo.AWSRegion),
	}
	s3StorageConfig := strings.Join(s3StorageConfigArray, "\n")
	s3StorageConfigHash := GetMD5Hash(s3StorageConfig)
	s3StorageConfigName := fmt.Sprintf("s3_storage_%s", s3StorageConfigHash)
	Configs["s3_storage"] = Config{
		Name: s3StorageConfigName,
		Data: s3StorageConfig,
	}

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
	traefikConfigHash := GetMD5Hash(traefikConfig)
	traefikConfigName := fmt.Sprintf("traefik_config_%s", traefikConfigHash)
	Configs["traefik_config"] = Config{
		Name: traefikConfigName,
		Data: traefikConfig,
	}

	return Configs
}
