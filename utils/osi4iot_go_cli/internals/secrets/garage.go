package secrets

import (
	"fmt"
	"slices"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// createGarageSecrets builds the secrets of the Garage instances —
// garage.toml (shared by all), garage_provision (mounted on the primary
// only), one node identity per instance — plus the one of garage_webui:
//
//   - garage: garage.toml, with the RPC secret and the admin/metrics
//     tokens in it — hence a secret rather than a config;
//   - garage_provision: the input of garage-provision, which runs in the
//     container on every start and makes Garage match it — layout, the
//     platform's bucket, one key per S3 consumer and their permissions.
//
// Both are named after a hash of their content, like every other secret
// here: rotating a key changes garage_provision's name, Swarm restarts
// garage with the new one, and garage-provision re-imports the key.
func createGarageSecrets(pi pt.PlatformInfo) (map[string]pt.Secret, error) {
	config := utils.GarageConfigToml(pi)
	provision := utils.GarageProvisionSpec(pi)
	secrets := map[string]pt.Secret{
		"garage": {
			Name: fmt.Sprintf("garage_%s", utils.GetMD5Hash(config)),
			Data: config,
		},
		"garage_provision": {
			Name: fmt.Sprintf("garage_provision_%s", utils.GetMD5Hash(provision)),
			Data: provision,
		},
	}
	// Each instance's Garage identity: the 64-byte node_key file the
	// image's entrypoint puts in the metadata directory before Garage
	// first starts. Raw bytes, exactly what Garage reads.
	for _, inst := range pi.GarageInstances {
		key, err := utils.GarageNodeKeyBytes(inst)
		if err != nil {
			return nil, err
		}
		data := string(key)
		secrets[GarageNodeKeySecretKey(inst.ID)] = pt.Secret{
			Name: fmt.Sprintf("garage_node_key_%d_%s", inst.ID, utils.GetMD5Hash(data)),
			Data: data,
		}
	}

	// The .env of garage_webui: endpoints, region, Garage's admin token
	// and the login (see utils/garage_webui.go).
	if !slices.Contains(pi.ExcludedServices, utils.GarageWebUIServiceName) {
		webui := utils.GarageWebUIEnvFile(pi)
		secrets[utils.GarageWebUIServiceName] = pt.Secret{
			Name: fmt.Sprintf("garage_webui_%s", utils.GetMD5Hash(webui)),
			Data: webui,
		}
	}
	return secrets, nil
}

// GarageNodeKeySecretKey is the key of an instance's identity secret in
// the secrets map.
func GarageNodeKeySecretKey(id int) string {
	return fmt.Sprintf("garage_node_key_%d", id)
}
