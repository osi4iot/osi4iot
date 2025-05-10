package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func GrafanaService(pd *pt.PlatformData, sd pt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) pt.Service {
	domainName := pd.PlatformInfo.DomainName

	grafanaRule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/grafana/`)", domainName)
	grafanaRedirectRegex := fmt.Sprintf("%s/(grafana*)", domainName)
	grafanaRedirectReplacement := fmt.Sprintf("%s/$${1}", domainName)

	annotationsLabels := map[string]string{
		"traefik.enable":                    "true",
		"traefik.http.routers.grafana.rule": grafanaRule,
		"traefik.http.middlewares.grafana-prefix.stripprefix.prefixes":                       "/grafana",
		"traefik.http.routers.grafana.middlewares":                                           "grafana-prefix,grafana-header,grafana-redirectregex",
		"traefik.http.middlewares.grafana-prefix.stripprefix.forceslash":                     "false",
		"traefik.http.middlewares.grafana-header.headers.customrequestheaders.X-Script-Name": "/grafana/",
		"traefik.http.middlewares.grafana-redirectregex.redirectregex.regex":                 grafanaRedirectRegex,
		"traefik.http.middlewares.grafana-redirectregex.redirectregex.replacement":           grafanaRedirectReplacement,
		"traefik.http.routers.grafana.entrypoints":                                           "websecure",
		"traefik.http.routers.grafana.tls":                                                   "true",
		"traefik.http.routers.grafana.tls.certresolver":                                      "",
		"traefik.http.routers.grafana.service":                                               "grafana",
		"traefik.http.services.grafana.loadbalancer.server.port":                             "5000",
		"traefik.http.services.grafana.loadbalancer.healthCheck.path":                        "/api/health",
		"traefik.http.services.grafana.loadbalancer.healthCheck.interval":                    "5s",
		"traefik.http.services.grafana.loadbalancer.healthCheck.timeout":                     "3s",
	}

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "grafana.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["grafana"].ID,
			SecretName: sd.Secrets["grafana"].Name,
		},
	}

	configs := []*swarm.ConfigReference{
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/run/configs/grafana.conf",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["grafana"].ID,
			ConfigName: sd.Configs["grafana"].Name,
		},
	}

	constraints := []string{
		"node.role==manager",
	}

	return NewService("grafana", pd, sd).
		WithImage("ghcr.io/osi4iot/grafana:8.4.1-ubuntu").
		WithAnnotationsLabels(annotationsLabels).
		WithSecrets(secrets).
		WithConfigs(configs).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["grafana_data"].Name,
				Target: "/var/lib/grafana",
			},
		}).
		WithResources(
			resources.CPUs("grafana", nodeRoleMaps),
			resources.Memory("grafana", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("grafana", nodeRoleMaps)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}
