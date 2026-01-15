package services

import (
	"fmt"
	"time"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/utils"
)

func NatsService(
	replica int,
	numReplicas int,
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	nodeRoleNumMaps map[string]int,
) pt.Service {
	// Define the NATS service
	serviceName := fmt.Sprintf("nats%d", replica)
	volName := fmt.Sprintf("nats%d_data", replica)
	numNodes := len(pd.PlatformInfo.NodesData)
	domainName := pd.PlatformInfo.DomainName

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/cert.pem",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["iot_platform_cert"].ID,
			SecretName: sd.Secrets["iot_platform_cert"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/key.pem",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["iot_platform_key"].ID,
			SecretName: sd.Secrets["iot_platform_key"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/nats.conf",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["nats_config"].ID,
			SecretName: sd.Secrets["nats_config"].Name,
		},
	}

	if pd.PlatformInfo.UseCustomNatsCACert == "Yes" {
		secrets = append(secrets, &swarm.SecretReference{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/etc/nats/ca.pem",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["iot_platform_ca_cert"].ID,
			SecretName: sd.Secrets["iot_platform_ca_cert"].Name,
		})
	}

	var natsPort uint32 = 4222
	var metricPort uint32 = 8222
	var mqttPort uint32 = 1883
	var websocketPort uint32 = 9001
	updateOrder := swarm.UpdateOrderStartFirst
	if numNodes == 1 && numReplicas > 1 {
		natsPort = uint32(4222 + (replica - 1))
		metricPort = uint32(8222 + (replica - 1))
		websocketPort = uint32(9001 + (replica - 1))
		mqttPort = uint32(1883 + (replica - 1))
		updateOrder = swarm.UpdateOrderStopFirst
	}

	ports := []swarm.PortConfig{
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    4222,
			PublishedPort: natsPort,
			PublishMode:   swarm.PortConfigPublishModeHost,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    8222,
			PublishedPort: metricPort,
			PublishMode:   swarm.PortConfigPublishModeHost,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    9001,
			PublishedPort: websocketPort,
			PublishMode:   swarm.PortConfigPublishModeHost,
		},
		{
			Protocol:      swarm.PortConfigProtocolTCP,
			TargetPort:    1883,
			PublishedPort: mqttPort,
			PublishMode:   swarm.PortConfigPublishModeHost,
		},
	}

	constraints := []string{
		"node.role==worker",
		fmt.Sprintf("node.labels.nats_%d==true", replica),
	}

	if nodeRoleNumMaps["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	updateConfig := &swarm.UpdateConfig{
		Parallelism:     1,
		Delay:           10 * time.Second,                  // Delay entre nodos del cluster
		FailureAction:   swarm.UpdateFailureActionRollback, // Rollback automático
		Monitor:         15 * time.Second,                  // NATS arranca rápido, 15s es suficiente
		MaxFailureRatio: 0,                                 // Con 1 réplica, cualquier fallo es crítico
		Order:           updateOrder,                       // Importante para mantener disponibilidad
	}

	rollbackConfig := &swarm.UpdateConfig{
		Parallelism:     1,
		Delay:           5 * time.Second,
		FailureAction:   swarm.UpdateFailureActionRollback, // Rollback automático
		Monitor:         15 * time.Second,
		MaxFailureRatio: 0,
		Order:           updateOrder,
	}

	image := utils.GetServiceImage(pd, "nats", "ghcr.io/osi4iot/nats:2.11.1-alpine")
	return NewService(serviceName, pd, sd).
		WithImage(image).
		WithHostname(serviceName).
		WithEnv([]string{
			fmt.Sprintf("SERVER_NAME=\"%s\"", serviceName),
		}).
		WithCommand([]string{"nats-server", "-c", "/etc/nats/nats.conf", "-js"}).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[volName].Name,
				Target: "/data/nats",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(constraints).
		WithStopSignal("SIGUSR2").
		WithStopGracePeriod(3 * time.Minute).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithPorts(ports).
		WithHealthCheck([]string{
			"CMD-SHELL",
			"wget -qO- http://localhost:8222/healthz | grep -q '\"status\":\"ok\"' || exit 1",
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["nats_network"].Name, Aliases: []string{fmt.Sprintf("nats%d.%s", replica, domainName)}},
		}).
		WithUpdateConfig(updateConfig).
		WithRollbackConfig(rollbackConfig).
		Build()
}
