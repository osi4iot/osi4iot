package services

import (
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"

	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func TraefikService(
	pd *pt.PlatformData, 
	sd pt.SwarmData, 
	svcResourcesMap resources.SvcResourcesMap,
	nodeRoleMaps resources.NodesRoleMaps,
	) pt.Service {
	domainCertsType := pd.PlatformInfo.DomainCertsType

	commands := []string{
		"traefik",
		"--api.insecure=false",
		"--providers.docker=true",
		"--providers.docker.swarmMode=true",
		"--providers.docker.exposedByDefault=false",
		"--entrypoints.web.address=:80",
		"--ping=true",
		"--entrypoints.web.http.redirections.entrypoint.to=websecure",
		"--entrypoints.web.http.redirections.entrypoint.scheme=https",
		"--entrypoints.web.http.redirections.entrypoint.permanent=true",
		"--entrypoints.websecure.address=:443",
		"--providers.docker.network=traefik_public",
		"--api",
		"--accesslog",
		"--log",
	}

	// define los puertos básicos
	ports := []swarm.PortConfig{
		{Protocol: swarm.PortConfigProtocolTCP, TargetPort: 80, PublishedPort: 80},
		{Protocol: swarm.PortConfigProtocolTCP, TargetPort: 443, PublishedPort: 443},
	}

	traefikSecrets := []*swarm.SecretReference{}
	traefikConfigs := []*swarm.ConfigReference{}
	if domainCertsType != "No certs" {
		traefikSecrets = []*swarm.SecretReference{
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "iot_platform_cert.cer",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets["iot_platform_cert"].ID,
				SecretName: sd.Secrets["iot_platform_cert"].Name,
			},
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "iot_platform.key",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets["iot_platform_key"].ID,
				SecretName: sd.Secrets["iot_platform_key"].Name,
			},
		}

		traefikConfigs = []*swarm.ConfigReference{
			{
				File: &swarm.ConfigReferenceFileTarget{
					Name: "/etc/traefik/dynamic/traefik.yml",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				ConfigID:   sd.Configs["traefik"].ID,
				ConfigName: sd.Configs["traefik"].Name,
			},
		}

		commands = append(commands, "--providers.file.filename=/etc/traefik/dynamic/traefik.yml")
		commands = append(commands, "--providers.file.watch=true")
	}

	return NewService("traefik", pd, sd).
		WithImage("ghcr.io/osi4iot/traefik_go_cli:v2.10").
		WithHealthCheck([]string{
			"CMD-SHELL",
			"wget --quiet --tries=1 --spider --no-check-certificate http://127.0.0.1:8080/ping || exit 1",
		}).
		WithCommand(commands).
		WithSecrets(traefikSecrets).
		WithConfigs(traefikConfigs).
		WithMounts([]mount.Mount{
			{Type: mount.TypeBind, Source: "/var/run/docker.sock", Target: "/var/run/docker.sock", ReadOnly: true},
		}).
		WithResources(
			resources.CPUs("traefik", svcResourcesMap),
			resources.Memory("traefik", svcResourcesMap),
		).
		WithPlacement([]string{
			"node.role == manager",
		}).
		WithModeReplicated(resources.GiveReplicsPtr("traefik", nodeRoleMaps)).
		WithPorts(ports).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}
