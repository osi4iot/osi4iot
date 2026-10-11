package volumes

import (
	"context"
	"fmt"
	"regexp"
	"sort"

	"github.com/docker/docker/api/types/volume"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// replicaVolumeName matches the per-replica volumes of NATS and both
// Patroni families at ANY replica number — including those of replicas
// the current state no longer lists, which platformVolumeNames misses
// (a scale-down that did not remove its volumes left exactly those).
var replicaVolumeName = regexp.MustCompile(`^(nats\d+_data|patroni_(admin|metrics)\d+-data)$`)

// FindLeftoverPlatformVolumes lists the volumes of a previous platform
// still present on any node — "<node>: <volume>" — plus its EBS volumes
// when EBS is in use.
//
// For `osi4iot init --reset-passwords`: the platform about to be created
// gets all-new secrets, and data written under the old ones (database
// roles and their passwords, values encrypted with the old keys, NATS
// streams) would be unusable by it. Every node must be checked, so an
// unreachable one is an error rather than something to skip.
func FindLeftoverPlatformVolumes(pd *pt.PlatformData) ([]string, error) {
	known := platformVolumeNames(pd)
	var found []string

	for node, dc := range pt.DCMap {
		if dc == nil || dc.Cli == nil {
			return nil, fmt.Errorf("node %s is unreachable, so it cannot be checked for volumes of the previous platform", node)
		}
		resp, err := dc.Cli.VolumeList(dc.Ctx, volume.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("listing volumes on node %s: %w", node, err)
		}
		for _, v := range resp.Volumes {
			if known[v.Name] || v.Labels["app"] == "osi4iot" || replicaVolumeName.MatchString(v.Name) {
				found = append(found, fmt.Sprintf("%s: %s", node, v.Name))
			}
		}
	}

	if pd.PlatformInfo.UseAwsEbsVolumes {
		ebs, err := ListOsi4iotEBSVolumes(context.Background(), pd.PlatformInfo.DomainName)
		if err != nil {
			return nil, fmt.Errorf("listing EBS volumes: %w", err)
		}
		for _, v := range ebs {
			found = append(found, fmt.Sprintf("EBS: %s (%s)", v.VolumeID, v.Tags["Name"]))
		}
	}

	sort.Strings(found)
	return found, nil
}
