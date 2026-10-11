package services

import (
	"fmt"
	"time"

	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// GarageWebUIService is the admin interface of the platform's Garage
// (khairul169/garage-webui), at https://<domain>/garage_webui.
//
// Always on a manager node. It holds Garage's admin token, which can do
// anything to the object store — keys, permissions, buckets, layout — so
// it runs where the swarm's most trusted components do, not on the
// workers that run the platform's data-plane services.
//
// Its whole configuration is the garage_webui secret, mounted where the
// application looks for a .env file — its working directory, /app in
// ghcr.io/osi4iot/garage_webui — owned by and readable only to the
// unprivileged user the image runs as. See utils/garage_webui.go for why
// it is not given garage.toml.
//
// What the interface can and cannot undo: changes to the keys and
// permissions osi4iot manages are reverted by the garage service's
// provisioning the next time Garage starts, and Garage refuses to delete
// a bucket that still holds objects.
func GarageWebUIService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
) pt.Service {
	name := utils.GarageWebUIServiceName
	rule := fmt.Sprintf("Host(`%s`) && PathPrefix(`%s`)",
		pd.PlatformInfo.DomainName, utils.GarageWebUIBasePath)

	// No stripprefix middleware: the application serves under BASE_PATH
	// itself — pages, assets and /api — and redirects anything else to it.
	annotationsLabels := map[string]string{
		"traefik.enable":                                              "true",
		"traefik.http.routers." + name + ".rule":                      rule,
		"traefik.http.routers." + name + ".entrypoints":               "websecure",
		"traefik.http.routers." + name + ".tls":                       "true",
		"traefik.http.routers." + name + ".tls.certresolver":          "",
		"traefik.http.routers." + name + ".service":                   name,
		"traefik.http.services." + name + ".loadbalancer.server.port": fmt.Sprint(utils.GarageWebUIPort),
	}

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				// Absolute target: the application loads ".env" from its
				// working directory.
				Name: utils.GarageWebUIEnvPath,
				UID:  utils.GarageWebUIUID,
				GID:  utils.GarageWebUIUID,
				Mode: 0400,
			},
			SecretID:   sd.Secrets[name].ID,
			SecretName: sd.Secrets[name].Name,
		},
	}

	image := utils.GetServiceImage(pd, name, utils.DefaultGarageWebUIImage)
	return NewService(name, pd, sd).
		WithImage(image).
		WithAnnotationsLabels(annotationsLabels).
		WithEnv([]string{
			// Not secret, and the path Traefik routes on.
			"BASE_PATH=" + utils.GarageWebUIBasePath,
		}).
		WithSecrets(secrets).
		// Same check as the image's HEALTHCHECK, set here so it does not
		// depend on the image tag deployed; with a fast start interval,
		// because a task stays out of Traefik until its first check passes.
		WithHealthCheckOptions(
			[]string{"CMD", "curl", "--fail", "--silent", "--output", "/dev/null",
				fmt.Sprintf("http://127.0.0.1:%d%s/", utils.GarageWebUIPort, utils.GarageWebUIBasePath)},
			30*time.Second, 5*time.Second, 15*time.Second, 3,
		).
		WithHealthCheckStartInterval(15*time.Second, 2*time.Second).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement([]string{"node.role==manager"}).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["traefik_public"].Name},
		}).
		Build()
}
