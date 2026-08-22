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

func GenerateConfigs(pd *pt.PlatformData) map[string]pt.Config {
	pi := pd.PlatformInfo
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

	numNatsReplicas := utils.GetServiceReplicas(pd, "nats")
	natsSeedServers := natsSeedServersForFrontend(pd, numNatsReplicas, pi.DomainName)
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
		fmt.Sprintf("NATS_SEED_SERVERS=%s", strings.Join(natsSeedServers, ",")),
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

	Configs["vector"] = CreateVectorConfig(pd)

	if pi.UsePatroniTool {
		Configs["haproxy_patroni"] = createHaproxyPatroniConfig(pd)
	}

	return Configs
}

// createHaproxyPatroniConfig generates the haproxy.cfg content dynamically
// based on NumPatroniAdminNodes and NumPatroniMetricsNodes so the config
// is correct for 1-node local deployments as well as 3- or 5-node clusters.
func createHaproxyPatroniConfig(pd *pt.PlatformData) pt.Config {
	pi := pd.PlatformInfo
	numAdmin := utils.Max(pi.NumPatroniAdminNodes, 1)
	numMetrics := utils.Max(pi.NumPatroniMetricsNodes, 1)

	var b strings.Builder

	b.WriteString(`global
    maxconn 100
    log stdout format raw local0

defaults
    log     global
    mode    tcp
    retries 2
    timeout client      30m
    timeout connect     4s
    timeout server      30m
    timeout check       5s

resolvers docker_dns
    nameserver dns1 127.0.0.11:53
    resolve_retries 3
    timeout resolve 1s
    timeout retry   1s
    hold other      10s
    hold refused    10s
    hold nx         10s
    hold timeout    10s
    hold valid      10s
    hold obsolete   10s

# Stats dashboard
listen stats
    mode http
    bind *:7000
    stats enable
    stats uri /
    stats refresh 10s
    stats show-legends
    stats show-node

# ── Admin cluster (PostgreSQL 18) ─────────────────────────────────────────────

# Port 5000 — Admin writes (primary only)
# /primary returns HTTP 200 only on the Patroni primary node
listen admin-primary
    bind *:5000
    option httpchk GET /primary
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
`)
	for i := 1; i <= numAdmin; i++ {
		fmt.Fprintf(&b, "    server patroni-admin%d patroni-admin%d:5432 check port 8008 resolvers docker_dns init-addr none\n", i, i)
	}

	b.WriteString(`
# Port 5001 — Admin reads (round-robin across all healthy nodes)
# /read-only returns HTTP 200 on all healthy cluster members
listen admin-replicas
    bind *:5001
    option httpchk GET /read-only
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
`)
	for i := 1; i <= numAdmin; i++ {
		fmt.Fprintf(&b, "    server patroni-admin%d patroni-admin%d:5432 check port 8008 resolvers docker_dns init-addr none\n", i, i)
	}

	b.WriteString(`
# Port 5002 — Admin backup trigger (primary only)
# Forwards to backup_trigger's sidecar HTTP server (see patroni_admin's
# entrypoint.sh), which runs "wal-g backup-push" locally against this
# node's own PGDATA. Always routed to the primary, same health check as
# admin-primary, so system_manager never needs to know which physical
# node currently holds that role.
listen admin-backup-trigger
    bind *:5002
    option httpchk GET /primary
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
`)
	for i := 1; i <= numAdmin; i++ {
		fmt.Fprintf(&b, "    server patroni-admin%d patroni-admin%d:8091 check port 8008 resolvers docker_dns init-addr none\n", i, i)
	}

	b.WriteString(`
# ── Metrics cluster (TimescaleDB) ────────────────────────────────────────────

# Port 5100 — Metrics writes (primary only)
listen metrics-primary
    bind *:5100
    option httpchk GET /primary
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
`)
	for i := 1; i <= numMetrics; i++ {
		fmt.Fprintf(&b, "    server patroni-metrics%d patroni-metrics%d:5432 check port 8008 resolvers docker_dns init-addr none\n", i, i)
	}

	b.WriteString(`
# Port 5101 — Metrics reads (round-robin across all healthy nodes)
listen metrics-replicas
    bind *:5101
    option httpchk GET /read-only
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
`)
	for i := 1; i <= numMetrics; i++ {
		fmt.Fprintf(&b, "    server patroni-metrics%d patroni-metrics%d:5432 check port 8008 resolvers docker_dns init-addr none\n", i, i)
	}

	b.WriteString(`
# Port 5102 — Metrics backup trigger (primary only)
# Same purpose as admin-backup-trigger, for the metrics cluster.
listen metrics-backup-trigger
    bind *:5102
    option httpchk GET /primary
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
`)
	for i := 1; i <= numMetrics; i++ {
		fmt.Fprintf(&b, "    server patroni-metrics%d patroni-metrics%d:8091 check port 8008 resolvers docker_dns init-addr none\n", i, i)
	}

	data := b.String()
	hash := utils.GetMD5Hash(data)
	return pt.Config{
		Name: fmt.Sprintf("haproxy_patroni_%s", hash),
		Data: data,
	}
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

	if pd.PlatformInfo.UsePatroniTool {
		keys = append(keys, "haproxy_patroni")
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

func natsSeedServersForFrontend(pd *pt.PlatformData, numNatsReplicas int, hostName string) []string {
	serversUrl := []string{}
	numNatsNodes := pd.PlatformInfo.NumOfNatsNodes
	numNatsSeedServers := utils.Min(numNatsReplicas, 3)
	if numNatsNodes == 1 {
			natUrl := fmt.Sprintf("wss://%s:9001", hostName)
			serversUrl = append(serversUrl, natUrl)
	} else if numNatsNodes >= 3 {
		for replica := 1; replica <= numNatsSeedServers; replica++ {
			natUrl := fmt.Sprintf("wss://nats%d.%s:9001", replica, hostName)
			serversUrl = append(serversUrl, natUrl)
		}
	}

	return serversUrl
}