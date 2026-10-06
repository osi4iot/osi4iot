package services

import (
	"time"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/secrets"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// GarageService is one instance of the platform's Garage cluster:
// service garage_<ID>, pinned to its node by the label garage_<ID>=true,
// with its own garage_meta_<ID> / garage_data_<ID> volumes. See
// utils/garage_cluster.go for the cluster as a whole.
//
// What every instance mounts:
//
//   - garage.toml, shared by all instances: replication factor, RPC
//     secret, and every instance as a bootstrap peer;
//   - its identity (node_key), which the image's entrypoint installs in
//     the metadata directory before Garage first starts — and refuses
//     to start over a different one, which would mean these volumes
//     belong to another instance.
//
// The primary instance (lowest ID) also mounts garage_provision, and its
// entrypoint provisions the cluster: the first layout, the platform's
// bucket, one key per S3 consumer and their permissions. The others just
// run Garage.
//
// Clients reach the cluster as http://garage:3900: every instance
// carries the alias "garage" on internal_net, in DNS round-robin mode, so
// the name resolves to the instances that are up. In development mode a
// single-instance Garage also publishes its S3 and admin ports on the
// node, which lets the CLI reach it without a helper container; several
// instances on one node could not all publish the same ports.
func GarageService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	inst pt.GarageInstance,
	primary bool,
	serveClients bool,
) pt.Service {
	name := utils.GarageInstanceServiceName(inst.ID)
	nodeKeySecret := sd.Secrets[secrets.GarageNodeKeySecretKey(inst.ID)]

	secretRefs := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "garage.toml", UID: "0", GID: "0", Mode: 0400,
			},
			SecretID:   sd.Secrets["garage"].ID,
			SecretName: sd.Secrets["garage"].Name,
		},
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "garage_node_key", UID: "0", GID: "0", Mode: 0400,
			},
			SecretID:   nodeKeySecret.ID,
			SecretName: nodeKeySecret.Name,
		},
	}
	if primary {
		secretRefs = append(secretRefs, &swarm.SecretReference{
			File: &swarm.SecretReferenceFileTarget{
				Name: "garage_provision", UID: "0", GID: "0", Mode: 0400,
			},
			SecretID:   sd.Secrets["garage_provision"].ID,
			SecretName: sd.Secrets["garage_provision"].Name,
		})
	}

	ports := []swarm.PortConfig{}
	if pd.PlatformInfo.DeploymentMode == "development" && len(pd.PlatformInfo.GarageInstances) == 1 {
		ports = []swarm.PortConfig{
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    utils.GarageS3Port,
				PublishedPort: utils.GarageS3Port,
				PublishMode:   swarm.PortConfigPublishModeHost,
			},
			{
				Protocol:      swarm.PortConfigProtocolTCP,
				TargetPort:    utils.GarageAdminPort,
				PublishedPort: utils.GarageAdminPort,
				PublishMode:   swarm.PortConfigPublishModeHost,
			},
		}
	}

	// The healthcheck answers "is THIS node alive", not "can the cluster
	// serve", whenever there are several instances. Swarm puts a task in
	// its service's DNS only once the task is healthy, and the instances
	// find each other by service name: gated on cluster health, none
	// would ever be resolvable, so none would ever join, so the cluster
	// would never be healthy. The same deadlock would hit a cluster that
	// lost its quorum: the survivors would drop out of DNS and the
	// returning instances could not find them.
	//
	// GetClusterStatus is answered by the local node over its own RPC,
	// with or without quorum. Cluster availability is checked where it
	// matters: the provisioning waits for `garage health` before
	// creating keys and the bucket, the CLI waits for the bucket, and
	// rebalancing requires a healthy cluster.
	//
	// A single instance has nobody to resolve: `garage health` is right
	// there, and keeps "healthy" meaning "can serve S3".
	healthCmd := []string{"CMD", "garage", "health", "-q"}
	if len(pd.PlatformInfo.GarageInstances) > 1 {
		healthCmd = []string{"CMD", "garage", "json-api", "GetClusterStatus"}
	}

	image := utils.GetServiceImage(pd, utils.GarageServiceName, utils.DefaultGarageImage)
	one := uint64(1)
	return NewService(name, pd, sd).
		WithImage(image).
		WithHostname(name).
		WithEnv([]string{
			"GARAGE_CONFIG_FILE=/run/secrets/garage.toml",
			"GARAGE_PROVISION_FILE=/run/secrets/garage_provision",
			"GARAGE_NODE_KEY_FILE=/run/secrets/garage_node_key",
			// How long the primary's provisioning waits for the cluster
			// to form before giving up (and the task restarting): the
			// other instances may still be pulling the image.
			"GARAGE_PROVISION_WAIT_SECONDS=600",
		}).
		WithSecrets(secretRefs).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[utils.GarageMetaVolumeName(inst.ID)].Name,
				Target: "/var/lib/garage/meta",
			},
			{
				Type:   mount.TypeVolume,
				Source: sd.Volumes[utils.GarageDataVolumeName(inst.ID)].Name,
				Target: "/var/lib/garage/data",
			},
		}).
		WithHealthCheckOptions(
			healthCmd,
			15*time.Second, 10*time.Second, 30*time.Second, 5,
		).
		WithHealthCheckStartInterval(60*time.Second, 2*time.Second).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithDNSRoundRobin().
		WithPorts(ports).
		WithPlacement([]string{"node.labels." + utils.GarageInstanceLabel(inst.ID) + "==true"}).
		// One task per instance, always: an instance IS its volumes.
		WithModeReplicated(&one).
		// Never two Garage processes on the same LMDB metadata: the
		// builder's default is start-first.
		WithStatefulUpdateConfig(30 * time.Second).
		WithStopGracePeriod(30 * time.Second).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{
				Target:  sd.Networks["internal_net"].Name,
				Aliases: GarageClientAliases(serveClients),
			},
		}).
		Build()
}

// GarageClientAliases is the network alias set of an instance: "garage",
// the name every S3 client uses, when it serves clients; none otherwise.
//
// An instance must not serve clients while it is outside the layout, as
// a new one is until it joins and a retiring one is once it has left:
// the key, bucket and alias tables are replicated on every node OF THE
// LAYOUT, so such an instance has no keys and answers every request with
// 403 "No such key". It is still reached by its own name, garage_<ID>,
// which is how the other instances talk to it.
func GarageClientAliases(serveClients bool) []string {
	if serveClients {
		return []string{utils.GarageServiceName}
	}
	return nil
}

