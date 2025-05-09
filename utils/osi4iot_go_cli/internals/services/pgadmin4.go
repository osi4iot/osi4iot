package services

import (
	"fmt"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/common"
	dt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
)

func Pgadmin4Service(pd *common.PlatformData, sd dt.SwarmData, nodeRoleMaps resources.NodesRoleMaps) dt.Service {
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
				Name: "grafana.txt",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["grafana"].ID,
			SecretName: sd.Secrets["grafana"].Name,
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

	return NewService("pgadmin4", pd, sd).
		WithImage("ghcr.io/osi4iot/pgadmin4:2023-10-18-2").
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
		WithResources(
			resources.CPUs("pgadmin4", nodeRoleMaps),
			resources.Memory("pgadmin4", nodeRoleMaps),
		).
		WithPlacement(constraints).
		WithModeReplicated(resources.GiveReplicsPtr("pgadmin4", nodeRoleMaps)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}
