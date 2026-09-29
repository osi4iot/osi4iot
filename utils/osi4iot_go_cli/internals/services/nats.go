package services

import (
	"fmt"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
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

	offset := uint32(utils.NatsReplicaPortOffset(pd, replica, numReplicas))
	var natsPort uint32 = 4222 + offset
	var metricPort uint32 = 8222 + offset
	var mqttPort uint32 = 1883 + offset
	var websocketPort uint32 = 9001 + offset
	updateOrder := swarm.UpdateOrderStopFirst

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

	constraints := []string{"node.role==manager"}
	if resources.UsesPlacementLabels(pd) {
		constraints = []string{
			"node.role==worker",
			fmt.Sprintf("node.labels.nats_%d==true", replica),
		}
	}
	
	if nodeRoleNumMaps["Platform worker"] == 0 {
		constraints = []string{
			"node.role==manager",
		}
	}

	updateConfig := &swarm.UpdateConfig{
		Parallelism:     1,
		Delay:           10 * time.Second,
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         60 * time.Second,
		MaxFailureRatio: 0,
		Order:           updateOrder,
	}

	rollbackConfig := &swarm.UpdateConfig{
		Parallelism:     1,
		Delay:           5 * time.Second,
		FailureAction:   swarm.UpdateFailureActionRollback,
		Monitor:         60 * time.Second,
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
		WithHealthConfig(NatsHealthCheck(numReplicas)).
		WithHealthCheckStartInterval(60*time.Second, time.Second).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{
				Target: sd.Networks["nats_network"].Name,
				Aliases: []string{
					fmt.Sprintf("nats%d", replica),
					fmt.Sprintf("nats%d.%s", replica, domainName),
				},
			},
		}).
		WithUpdateConfig(updateConfig).
		WithRollbackConfig(rollbackConfig).
		Build()
}

// NatsHealthCheck is the NATS container health check for a deployment of
// numReplicas servers.
//
// Shared by NatsService, for the replicas it creates, and by the nats
// scale, which re-applies it to the replicas it keeps and restarts:
// their spec would otherwise keep the check — and the timings — they
// were created with.
//
// Checked every second while starting (StartPeriod/StartInterval),
// every 10s afterwards. Swarm adds a task to its service's VIP and DNS
// only once it is healthy, so the first check decides how long a
// restarted nats1 stays unreachable by name — for auth_callout, which
// connects by name, and for the other servers' routes. With a plain
// 10s Interval that was ~10s after every restart: clients reaching
// nats1 through its host port found no auth_callout to answer them,
// and vector fell back to public DNS. Failures inside StartPeriod do
// not count against Retries; the first success ends it. StartInterval
// needs Docker Engine 25+ (API 1.44); older engines ignore it and check
// at Interval, as before.
func NatsHealthCheck(numReplicas int) *container.HealthConfig {
	// A standalone server is healthy only when fully ready (/healthz).
	// In a cluster, a member only needs JetStream enabled to take
	// traffic: being current with the meta leader can take a while for
	// a member that has just restarted.
	cmd := "wget -qO- http://localhost:8222/healthz | grep -q '\"status\":\"ok\"' || exit 1"
	if numReplicas > 1 {
		cmd = "wget -qO- 'http://localhost:8222/healthz?js-enabled-only=1' | grep -q '\"status\":\"ok\"' || exit 1"
	}
	return &container.HealthConfig{
		Test:          []string{"CMD-SHELL", cmd},
		Interval:      10 * time.Second,
		Timeout:       1 * time.Second,
		Retries:       3,
		StartPeriod:   60 * time.Second,
		StartInterval: 1 * time.Second,
	}
}

