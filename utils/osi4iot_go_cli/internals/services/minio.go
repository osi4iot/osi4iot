package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func MinioService(pd *pt.PlatformData, sd pt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) pt.Service {
	domainName := pd.PlatformInfo.DomainName

	minioRule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/minio_api`)", domainName)
	minioConsoleRule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/minio`)", domainName)
	minioRedirectRegex := fmt.Sprintf("%s/(minio*)", domainName)
	minioRedirectReplacement := fmt.Sprintf("%s/$${1}", domainName)

	annotationsLabels := map[string]string{
		"traefik.enable":                                                                           "true",
		"traefik.http.routers.minio_api.rule":                                                      minioRule,
		"traefik.http.routers.minio_api.entrypoints":                                               "websecure",
		"traefik.http.routers.minio_api.tls":                                                       "true",
		"traefik.http.routers.minio_api.tls.certresolver":                                          "",
		"traefik.http.routers.minio_api.service":                                                   "minio",
		"traefik.http.services.minio.loadbalancer.server.port":                                     "9000",
		"traefik.http.services.minio.loadbalancer.healthCheck.path":                                "/minio/health/live",
		"traefik.http.services.minio.loadbalancer.healthCheck.interval":                            "5s",
		"traefik.http.services.minio.loadbalancer.healthCheck.timeout":                             "3s",
		"traefik.http.routers.minio_console.rule":                                                  minioConsoleRule,
		"traefik.http.middlewares.minio_console-prefix.stripprefix.prefixes":                       "/minio",
		"traefik.http.routers.minio_console.middlewares":                                           "minio_console-prefix,minio_console-header,minio_console-redirectregex",
		"traefik.http.middlewares.minio_console-prefix.stripprefix.forceslash":                     "false",
		"traefik.http.middlewares.minio_console-header.headers.customrequestheaders.X-Script-Name": "/minio/",
		"traefik.http.middlewares.minio_console-redirectregex.redirectregex.regex":                 minioRedirectRegex,
		"traefik.http.middlewares.minio_console-redirectregex.redirectregex.replacement":           minioRedirectReplacement,
		"traefik.http.routers.minio_console.entrypoints":                                           "websecure",
		"traefik.http.routers.minio_console.tls":                                                   "true",
		"traefik.http.routers.minio_console.tls.certresolver":                                      "",
		"traefik.http.routers.minio_console.service":                                               "minio_console",
		"traefik.http.services.minio_console.loadbalancer.server.port":                             "9090",
	}

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/run/secrets/minio.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["minio"].ID,
			SecretName: sd.Secrets["minio"].Name,
		},
	}

	constraints := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}

	if nodeRoleMaps.NodeRoleNumMap["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	return NewService("minio", pd, sd).
		WithImage("ghcr.io/osi4iot/minio:RELEASE.2023-10-16T04-13-43Z").
		WithAnnotationsLabels(annotationsLabels).
		WithHostname("minio").
		WithEnv([]string{
			"MINIO_VOLUMES=/mnt/data",
			fmt.Sprintf("MINIO_BROWSER_REDIRECT_URL=https://%s/minio", domainName),
		}).
		WithArgs([]string{
			"server",
			"--console-address",
			":9090",
			"/mnt/data",
		}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["minio_storage"].Name,
				Target: "/mnt/data",
			},
		}).
		WithResources(
			resources.CPUs("minio", nodeRoleMaps),
			resources.Memory("minio", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("minio", nodeRoleMaps)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}
