package configs

import (
	"fmt"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func GenerateConfigs(platformData *pt.PlatformData) map[string]pt.Config {
	pi := platformData.PlatformInfo
	Configs := make(map[string]pt.Config)
	platformName := strings.Replace(pi.PlatformName, " ", "_", -1)
	protocol := "https"
	if pi.DomainCertsType == "No certs" {
		protocol = "http"
	}
	domainCertsType := pi.DomainCertsType

	adminAPIConfigArray := []string{
		fmt.Sprintf("PLATFORM_NAME=%s", platformName),
		fmt.Sprintf("DOMAIN_NAME=%s", pi.DomainName),
		fmt.Sprintf("PROTOCOL=%s", protocol),
		fmt.Sprintf("DEPLOYMENT_LOCATION=\"%s\"", pi.DeploymentLocation),
		fmt.Sprintf("PLATFORM_PHRASE=\"%s\"", pi.PlatformPhrase),
		fmt.Sprintf("MAIN_ORGANIZATION_NAME=\"%s\"", pi.MainOrganizationName),
		fmt.Sprintf("MAIN_ORGANIZATION_ACRONYM=%s", pi.MainOrganizationAcronym),
		fmt.Sprintf("MAIN_ORGANIZATION_ADDRESS1=\"%s\"", pi.MainOrganizationAddress1),
		fmt.Sprintf("MAIN_ORGANIZATION_CITY=\"%s\"", pi.MainOrganizationCity),
		fmt.Sprintf("MAIN_ORGANIZATION_ZIP_CODE=%s", pi.MainOrganizationZipCode),
		fmt.Sprintf("MAIN_ORGANIZATION_STATE=\"%s\"", pi.MainOrganizationState),
		fmt.Sprintf("MAIN_ORGANIZATION_COUNTRY=\"%s\"", pi.MainOrganizationCountry),
		fmt.Sprintf("S3_BUCKET_TYPE=\"%s\"", pi.S3BucketType),
		fmt.Sprintf("S3_BUCKET_NAME=%s", pi.S3BucketName),
		fmt.Sprintf("AWS_REGION=%s", utils.AwsRegionsMap[pi.AWSRegionS3Bucket]),
	}
	adminAPIConfig := strings.Join(adminAPIConfigArray, "\n")
	adminAPIConfigHash := utils.GetMD5Hash(adminAPIConfig)
	adminAPIConfigName := fmt.Sprintf("admin_api_%s", adminAPIConfigHash)
	Configs["admin_api"] = pt.Config{
		Name: adminAPIConfigName,
		Data: adminAPIConfig,
	}

	mainOrgBuilding := pi.MainOrganizationBuilding
	mainOrgBuildingHash := utils.GetMD5Hash(mainOrgBuilding)
	mainOrgBuildingName := fmt.Sprintf("main_org_building_%s", mainOrgBuildingHash)
	Configs["main_org_building"] = pt.Config{
		Name: mainOrgBuildingName,
		Data: mainOrgBuilding,
	}

	mainOrgFloor := pi.MainOrganizationFirstFloor
	mainOrgFloorHash := utils.GetMD5Hash(mainOrgFloor)
	mainOrgFloorName := fmt.Sprintf("main_org_floor_%s", mainOrgFloorHash)
	Configs["main_org_floor"] = pt.Config{
		Name: mainOrgFloorName,
		Data: mainOrgFloor,
	}

	frontendConfigArray := []string{
		fmt.Sprintf("PLATFORM_NAME=%s", platformName),
		fmt.Sprintf("DOMAIN_NAME=%s", pi.DomainName),
		fmt.Sprintf("PROTOCOL=%s", protocol),
		fmt.Sprintf("DEPLOYMENT_LOCATION=\"%s\"", pi.DeploymentLocation),
		fmt.Sprintf("DEPLOYMENT_MODE=%s", pi.DeploymentMode),
		fmt.Sprintf("MIN_LONGITUDE=%f", pi.MinLongitude),
		fmt.Sprintf("MAX_LONGITUDE=%f", pi.MaxLongitude),
		fmt.Sprintf("MIN_LATITUDE=%f", pi.MinLatitude),
		fmt.Sprintf("MAX_LATITUDE=%f", pi.MaxLatitude),
	}
	frontendConfig := strings.Join(frontendConfigArray, "\n")
	frontendConfigHash := utils.GetMD5Hash(frontendConfig)
	frontendConfigName := fmt.Sprintf("frontend_%s", frontendConfigHash)
	Configs["frontend"] = pt.Config{
		Name: frontendConfigName,
		Data: frontendConfig,
	}

	grafanaConfigArray := []string{
		fmt.Sprintf("DOMAIN_NAME=%s", pi.DomainName),
		fmt.Sprintf("DEFAULT_TIME_ZONE=%s", pi.DefaultTimeZone),
		fmt.Sprintf("MAIN_ORGANIZATION_NAME=\"%s\"", pi.MainOrganizationName),
		fmt.Sprintf("MAIN_ORGANIZATION_ACRONYM=%s", strings.Replace(pi.MainOrganizationAcronym, " ", "_", -1)),
	}
	grafanaConfig := strings.Join(grafanaConfigArray, "\n")
	grafanaConfigHash := utils.GetMD5Hash(grafanaConfig)
	grafanaConfigName := fmt.Sprintf("grafana_%s", grafanaConfigHash)
	Configs["grafana"] = pt.Config{
		Name: grafanaConfigName,
		Data: grafanaConfig,
	}

	if domainCertsType != "No certs" {
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
		Configs["traefik"] = pt.Config{
			Name: traefikConfigName,
			Data: traefikConfig,
		}

	}

	return Configs
}

func CreateConfig(dc *pt.DockerClient, config *pt.Config) (string, error) {
	existing, err := GetConfigByName(dc, config.Name)
	if err != nil {
		return "", fmt.Errorf("error checking existing config '%s': %v", config.Name, err)
	}
	if existing != nil {
		return existing.ID, nil
	}

	resp, err := dc.Cli.ConfigCreate(dc.Ctx, swarm.ConfigSpec{
		Annotations: swarm.Annotations{
			Name: config.Name,
			Labels: map[string]string{
				"app": "osi4iot",
			},
		},
		Data: []byte(config.Data),
	})
	if err != nil {
		return "", fmt.Errorf("error creating config '%s': %v", config.Name, err)
	}

	return resp.ID, nil
}

func GetConfigByName(dc *pt.DockerClient, configName string) (*swarm.Config, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingConfigs, err := dc.Cli.ConfigList(dc.Ctx, types.ConfigListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing configs: %v", err)
	}

	for _, c := range existingConfigs {
		if c.Spec.Name == configName {
			return &c, nil
		}
	}

	return nil, nil
}

func CreateSwarmConfigs(platformData *pt.PlatformData, dc *pt.DockerClient) (map[string]pt.Config, error) {
	configsToCreate := GenerateConfigs(platformData)
	createdConfigs := make(map[string]pt.Config, len(configsToCreate))

	for key, config := range configsToCreate {
		id, err := CreateConfig(dc, &config)
		if err != nil {
			return nil, fmt.Errorf("error creating config '%s': %v", key, err)
		}
		config.ID = id
		createdConfigs[key] = config
	}

	return createdConfigs, nil
}

func RemoveOrphanConfigs(
	dc *pt.DockerClient,
	activeServiceNames []string,
	knownConfigKeys []string,
) error {
	// ── 1. Recopilar todos los configs referenciados por los servicios activos ──
	referencedConfigIDs := make(map[string]struct{})
	for _, serviceName := range activeServiceNames {
		service, err := utils.GetSwarmServiceByName(dc, serviceName)
		if err != nil {
			return fmt.Errorf("error inspecting service '%s': %v", serviceName, err)
		}
		for _, ref := range service.Spec.TaskTemplate.ContainerSpec.Configs {
			referencedConfigIDs[ref.ConfigID] = struct{}{}
		}
	}

	// ── 2. Listar todos los configs de Docker que coincidan con algún prefijo ──
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	allConfigs, err := dc.Cli.ConfigList(dc.Ctx, types.ConfigListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return fmt.Errorf("error listing configs: %v", err)
	}

	// ── 3. Identificar y eliminar los huérfanos ──────────────────────────────
	var removalErrors []string
	for _, config := range allConfigs {
		if !utils.HasKnownPrefix(config.Spec.Name, knownConfigKeys) {
			continue
		}
		if _, isReferenced := referencedConfigIDs[config.ID]; isReferenced {
			continue
		}

		fmt.Printf("Removing orphan config '%s'...\n", config.Spec.Name)
		if err := dc.Cli.ConfigRemove(dc.Ctx, config.ID); err != nil {
			removalErrors = append(removalErrors, fmt.Sprintf("'%s': %v", config.Spec.Name, err))
		}
	}

	if len(removalErrors) > 0 {
		return fmt.Errorf("could not remove some orphan configs:\n  - %s",
			strings.Join(removalErrors, "\n  - "))
	}

	return nil
}

func GetKnownConfigKeys(pd *pt.PlatformData) []string {
	keys := []string{
		"admin_api",
		"main_org_building",
		"main_org_floor",
		"frontend",
		"grafana",
	}

	if pd.PlatformInfo.DomainCertsType != "No certs" {
		keys = append(keys, "traefik")
	}

	return keys
}

func RemoveSwarmConfigs(dc *pt.DockerClient) error {
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

func GetConfigByKey(dc *pt.DockerClient, configKey string) (*pt.Config, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	existingConfigs, err := dc.Cli.ConfigList(dc.Ctx, types.ConfigListOptions{
		Filters: filterArgs,
	})
	if err != nil {
		return nil, fmt.Errorf("error listing configs: %v", err)
	}

	if len(existingConfigs) == 0 {
		return nil, fmt.Errorf("config %s not found", configKey)
	}

	var swarmConfig swarm.Config
	for _, c := range existingConfigs {
		if strings.Contains(c.Spec.Name, configKey) {
			swarmConfig = c
			break
		}
	}

	if swarmConfig.ID == "" {
		return nil, fmt.Errorf("config %s not found", configKey)
	}

	config := &pt.Config{
		ID:   swarmConfig.ID,
		Name: swarmConfig.Spec.Name,
		Data: string(swarmConfig.Spec.Data),
	}

	return config, nil
}
