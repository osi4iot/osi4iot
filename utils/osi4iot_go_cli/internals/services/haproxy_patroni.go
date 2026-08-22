package services

import (
	"time"

	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// HaproxyPatroniService creates the unified HAProxy service for both Patroni clusters.
//
// Port mapping:
//   5000 → Admin cluster writes  (primary only via /primary check)
//   5001 → Admin cluster reads   (round-robin all healthy nodes)
//   5100 → Metrics cluster writes (primary only)
//   5101 → Metrics cluster reads  (round-robin)
//   7000 → HAProxy stats dashboard
//
// The haproxy.cfg is injected via a Docker Swarm Config so it can be
// updated without rebuilding the image (docker config create haproxy_config).
//
// replicas: 2 — both replicas are placed on manager nodes and exposed via
// the Swarm routing mesh, so if one fails the other absorbs traffic
// immediately without waiting for a new container to start.
func HaproxyPatroniService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
) pt.Service {
	configs := []*swarm.ConfigReference{
		{
			File: &swarm.ConfigReferenceFileTarget{
				Name: "/usr/local/etc/haproxy/haproxy.cfg",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			ConfigID:   sd.Configs["haproxy_patroni"].ID,
			ConfigName: sd.Configs["haproxy_patroni"].Name,
		},
	}
 
	image := utils.GetServiceImage(pd, "haproxy_patroni", "ghcr.io/osi4iot/haproxy:2.8-alpine")
 
	replicas := uint64(2)
 
	return NewService("haproxy_patroni", pd, sd).
		WithImage(image).
		WithConfigs(configs).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement([]string{
			"node.role==manager",
		}).
		WithHealthCheckOptions(
			[]string{
				"CMD-SHELL",
				"nc -z 127.0.0.1 7000 || exit 1",
			},
			10*time.Second, // interval
			3*time.Second,  // timeout
			15*time.Second, // startPeriod
			3,              // retries
		).
		WithModeReplicated(&replicas).
		WithPorts([]swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    5000,
				PublishedPort: 5000,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    5001,
				PublishedPort: 5001,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    5002,
				PublishedPort: 5002,
			},			
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    5100,
				PublishedPort: 5100,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    5101,
				PublishedPort: 5101,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    5102,
				PublishedPort: 5102,
			},			
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    7000,
				PublishedPort: 7000,
			},
		}).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			// patroni_net: to reach the Patroni nodes (Raft, REST API, PG)
			{Target: sd.Networks["patroni_net"].Name},
			// internal_net: so platform services can connect via haproxy_patroni:5000/5100
			{Target: sd.Networks["internal_net"].Name},
		}).
		Build()
}
 