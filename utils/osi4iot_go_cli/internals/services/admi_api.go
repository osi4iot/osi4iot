package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func AdminApiService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	nodeRoleNumMap map[string]int,
) pt.Service {
	domainName := pd.PlatformInfo.DomainName

	adminApiRule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/admin_api/`)", domainName)

	annotationsLabels := map[string]string{
		"traefik.enable": "true",
		"traefik.http.middlewares.admin_api-header.headers.customrequestheaders.X-Script-Name": "/admin_api/",
		"traefik.http.middlewares.admin_api-prefix.stripprefix.prefixes":                       "/admin_api",
		"traefik.http.middlewares.admin_api-prefix.stripprefix.forceslash":                     "false",
		"traefik.http.middlewares.admin_api-redirectregex.redirectregex.regex":                 "^/admin_api(.*)",
		"traefik.http.middlewares.admin_api-redirectregex.redirectregex.replacement":           "/$1",
		"traefik.http.routers.admin_api.entrypoints":                                           "websecure",
		"traefik.http.routers.admin_api.rule":                                                  adminApiRule,
		"traefik.http.routers.admin_api.tls":                                                   "true",
		"traefik.http.routers.admin_api.tls.certresolver":                                      "",
		"traefik.http.routers.admin_api.middlewares":                                           "admin_api-redirectregex,admin_api-prefix,admin_api-header",
		"traefik.http.routers.admin_api.service":                                               "admin_api",
		"traefik.http.services.admin_api.loadbalancer.server.port":                             "3200",
		"traefik.http.services.admin_api.loadbalancer.healthcheck.path":                        "/health",
		"traefik.http.services.admin_api.loadbalancer.healthcheck.interval":                    "5s",
		"traefik.http.services.admin_api.loadbalancer.healthcheck.timeout":                     "3s",
	}

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "admin_api.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["admin_api"].ID,
			SecretName: sd.Secrets["admin_api"].Name,
		},
	}

	if pd.PlatformInfo.UseCustomNatsCACert == "Yes" {
		natsSecret := swarm.SecretReference{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/ca.pem",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["iot_platform_ca_cert"].ID,
			SecretName: sd.Secrets["iot_platform_ca_cert"].Name,
		}
		secrets = append(secrets, &natsSecret)
	}

	configs := []*swarm.ConfigReference{
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/run/configs/admin_api.conf",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["admin_api"].ID,
			ConfigName: sd.Configs["admin_api"].Name,
		},
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/run/configs/main_org_building.geojson",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["main_org_building"].ID,
			ConfigName: sd.Configs["main_org_building"].Name,
		},
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/run/configs/main_org_floor.geojson",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["main_org_floor"].ID,
			ConfigName: sd.Configs["main_org_floor"].Name,
		},
	}

	constraints := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}

	if nodeRoleNumMap["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	image := utils.GetServiceImage(pd, "admin_api", "ghcr.io/osi4iot/admin_api_nats:1.3.0")

	return NewService("admin_api", pd, sd).
		WithImage(image).
		WithEnv([]string{
			"REPLICA={{.Task.Slot}}",
		}).
		WithAnnotationsLabels(annotationsLabels).
		WithSecrets(secrets).
		WithConfigs(configs).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["admin_api_log"].Name,
				Target: "/app/logs",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(constraints).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithPorts([]swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    3200,
				PublishedPort: 3200,
			},
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
			{Target: sd.Networks["nats_network"].Name},
		}).
		Build()
}
