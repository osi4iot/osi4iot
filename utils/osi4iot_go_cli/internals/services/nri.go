package services

import (
	"fmt"
	"strings"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func NriService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	nodeRoleMaps resources.NodesRoleMaps,
	nriData pt.NriData,
	svcResourcesMap resources.SvcResourcesMap,
) (serviceName string, service pt.Service) {
	orgAcronym := nriData.Org.OrgAcronym
	orgAcronymLower := strings.ToLower(orgAcronym)
	messagingSystem := pd.PlatformInfo.MessagingSystem

	nriHash := nriData.Nri.NriHash
	serviceName = fmt.Sprintf("org_%s_nri_%s", orgAcronymLower, nriHash)
	volumeName := fmt.Sprintf("%s_data", serviceName)
	nodeRedInstanceHashPath := fmt.Sprintf("nodered_%s", nriHash)
	mqttClientCert := fmt.Sprintf("%s_%s_cert", orgAcronymLower, nriHash)
	mqttClientKey := fmt.Sprintf("%s_%s_key", orgAcronymLower, nriHash)
	nriNatsSecretsKey := fmt.Sprintf("%s_%s_nats", orgAcronymLower, nriHash)

	domainName := pd.PlatformInfo.DomainName

	annotationsLabels := map[string]string{
		"service_type":   "nodered_instance",
		"traefik.enable": "true",
		fmt.Sprintf("traefik.http.routers.%s.rule", serviceName): fmt.Sprintf(
			"Host(`%s`) && PathPrefix(`/%s/`)",
			domainName,
			nodeRedInstanceHashPath,
		),
		fmt.Sprintf("traefik.http.middlewares.%s-prefix.stripprefix.prefixes", serviceName): fmt.Sprintf(
			"/%s",
			nodeRedInstanceHashPath,
		),
		fmt.Sprintf("traefik.http.routers.%s.middlewares", serviceName): fmt.Sprintf(
			"%s-prefix,%s-header,%s-redirectregex",
			serviceName,
			serviceName,
			serviceName,
		),
		fmt.Sprintf("traefik.http.middlewares.%s-prefix.stripprefix.forceslash", serviceName): "false",
		fmt.Sprintf("traefik.http.middlewares.%s-header.headers.customrequestheaders.X-Script-Name", serviceName): fmt.Sprintf(
			"/%s/",
			nodeRedInstanceHashPath,
		),
		fmt.Sprintf("traefik.http.middlewares.%s-redirectregex.redirectregex.regex", serviceName): fmt.Sprintf(
			"%s/(%s*)",
			domainName,
			nodeRedInstanceHashPath,
		),
		fmt.Sprintf("traefik.http.middlewares.%s-redirectregex.redirectregex.replacement", serviceName): fmt.Sprintf(
			"%s/$${1}",
			domainName,
		),
		fmt.Sprintf("traefik.http.routers.%s.entrypoints", serviceName):               "websecure",
		fmt.Sprintf("traefik.http.routers.%s.tls", serviceName):                       "true",
		fmt.Sprintf("traefik.http.routers.%s.tls.certresolver", serviceName):          "",
		fmt.Sprintf("traefik.http.routers.%s.service", serviceName):                   serviceName,
		fmt.Sprintf("traefik.http.services.%s.loadbalancer.server.port", serviceName): "1880",
	}

	secrets := []*swarm.SecretReference{}
	switch messagingSystem {
	case "mqtt":
		mqttSecrets := []*swarm.SecretReference{
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "/data/certs/ca.crt",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets["mqtt_certs_ca_cert"].ID,
				SecretName: sd.Secrets["mqtt_certs_ca_cert"].Name,
			},
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "/data/certs/client.crt",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets[mqttClientCert].ID,
				SecretName: sd.Secrets[mqttClientCert].Name,
			},
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "/data/certs/client.key",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets[mqttClientKey].ID,
				SecretName: sd.Secrets[mqttClientKey].Name,
			},
		}
		secrets = append(secrets, mqttSecrets...)
	case "nats":
		natsSecrets := []*swarm.SecretReference{
			{
				File: &swarm.SecretReferenceFileTarget{
					Name: "/data/certs/nri_credentials",
					UID:  "0",
					GID:  "0",
					Mode: 0444,
				},
				SecretID:   sd.Secrets[nriNatsSecretsKey].ID,
				SecretName: sd.Secrets[nriNatsSecretsKey].Name,
			},
		}
		secrets = append(secrets, natsSecrets...)
	}

	return serviceName, NewService(serviceName, pd, sd).
		WithImage("ghcr.io/osi4iot/nodered_instance_nats:1.3.0").
		WithAnnotationsLabels(annotationsLabels).
		WithSecrets(secrets).
		WithEnv([]string{
			fmt.Sprintf("NODERED_INSTANCE_HASH=%s", nriHash),
			fmt.Sprintf("MESSAGING_SYSTEM=%s", messagingSystem),
		}).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volumeName].Name,
				Target: "/data",
			},
		}).
		WithResources(
			resources.CPUs("nodered_instance", svcResourcesMap),
			resources.Memory("nodered_instance", svcResourcesMap),
		).
		WithPlacement(nriData.ConstraintsArray).
		WithModeReplicated(resources.GiveReplicsPtr("nodered_instance", nodeRoleMaps)).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
			{Target: sd.Networks["nats_network"].Name},
		}).
		Build()
}
