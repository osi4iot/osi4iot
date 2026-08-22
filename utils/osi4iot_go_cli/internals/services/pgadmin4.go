package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

func Pgadmin4Service(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	nodeRoleNumMaps map[string]int,
) pt.Service {
	domainName := pd.PlatformInfo.DomainName

	pgadmin4Rule := fmt.Sprintf("Host(`%s`) && PathPrefix(`/pgadmin4/`)", domainName)
	pgadmin4RedirectRegex := fmt.Sprintf("%s/(pgadmin4*)", domainName)
	pgadmin4RedirectRepalcement := fmt.Sprintf("%s/$${1}", domainName)

	annotationsLabels := map[string]string{
		"traefik.enable":                     "true",
		"traefik.http.routers.pgadmin4.rule": pgadmin4Rule,
		"traefik.http.middlewares.pgadmin4-prefix.stripprefix.prefixes":                       "/pgadmin4",
		"traefik.http.routers.pgadmin4.middlewares":                                           "pgadmin4-prefix,pgadmin4-header,pgadmin4-redirectregex",
		"traefik.http.middlewares.pgadmin4-prefix.stripprefix.forceslash":                     "false",
		"traefik.http.middlewares.pgadmin4-header.headers.customrequestheaders.X-Script-Name": "/pgadmin4/",
		"traefik.http.middlewares.pgadmin4-redirectregex.redirectregex.regex":                 pgadmin4RedirectRegex,
		"traefik.http.middlewares.pgadmin4-redirectregex.redirectregex.replacement":           pgadmin4RedirectRepalcement,
		"traefik.http.routers.pgadmin4.entrypoints":                                           "websecure",
		"traefik.http.routers.pgadmin4.tls":                                                   "true",
		"traefik.http.routers.pgadmin4.tls.certresolver":                                      "",
		"traefik.http.routers.pgadmin4.service":                                               "pgadmin4",
		"traefik.http.services.pgadmin4.loadbalancer.server.port":                             "80",
	}

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "pgadmin4.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["pgadmin4"].ID,
			SecretName: sd.Secrets["pgadmin4"].Name,
		},
	}

	constraints := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}

	if nodeRoleNumMaps["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	image := utils.GetServiceImage(pd, "pgadmin4", "ghcr.io/osi4iot/pgadmin4:2026-07-30-1")
	return NewService("pgadmin4", pd, sd).
		WithImage(image).
		WithAnnotationsLabels(annotationsLabels).
		WithUser("0:0").
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes["pgadmin4_data"].Name,
				Target: "/var/lib/pgadmin",
			},
		}).
		WithBurstableResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
			svcResources.NanoCPUs*4,
			svcResources.MemoryBytes*4,
		).
		WithPlacement(constraints).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}
