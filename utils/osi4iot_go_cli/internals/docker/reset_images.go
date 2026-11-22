package docker

import (
	"fmt"
	"sort"
	"strings"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/services"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// ImageApplyResult is what --apply did to one swarm service.
type ImageApplyResult struct {
	// Entry is the SERVICES_DATA entry ("nats" for every natsN).
	Entry string
	// Service is the swarm service; empty when none is deployed.
	Service string
	Image   string
	// Status is "updated", "up to date", "not deployed" or "failed".
	Status   string
	Warnings string
	Err      error
}

// ApplyStateImages brings the running services of the given
// SERVICES_DATA entries in line with the image the state file holds for
// them, one service at a time, each waiting for its rolling update.
//
// It looks at what is running, not at what changed in the state file:
// a service already on its image is left alone, so re-running after a
// failure only touches what is still behind.
//
// "nats" is one entry for the whole family and stands for every natsN
// service. pipelines runs the GPU or CPU flavor of its image, as
// UpdateSwarmServiceImage does.
func ApplyStateImages(pd *pt.PlatformData, dc *pt.DockerClient, entries []string) []ImageApplyResult {
	results := []ImageApplyResult{}
	gpuPipelines := false
	if containsEntry(entries, "pipelines") {
		gpuPipelines = services.PipelinesGPUSpecFor(pd, resources.GetNodeRoleNumMap(pd)).UsesGPU
	}

	for _, entry := range entries {
		_, svcData, err := utils.FindServiceDataByName(pd, entry)
		if err != nil {
			results = append(results, ImageApplyResult{Entry: entry, Status: "failed", Err: err})
			continue
		}
		image := svcData.Image
		if entry == "pipelines" {
			image = services.PipelinesImageFlavor(image, gpuPipelines)
		}

		targets, err := swarmServicesOfEntry(dc, entry)
		if err != nil {
			results = append(results, ImageApplyResult{Entry: entry, Image: image, Status: "failed", Err: err})
			continue
		}
		if len(targets) == 0 {
			results = append(results, ImageApplyResult{Entry: entry, Image: image, Status: "not deployed"})
			continue
		}

		for i := range targets {
			svc := &targets[i]
			name := svc.Spec.Name
			res := ImageApplyResult{Entry: entry, Service: name, Image: image}
			if imageWithoutDigest(svc.Spec.TaskTemplate.ContainerSpec.Image) == image {
				res.Status = "up to date"
				results = append(results, res)
				continue
			}
			fmt.Printf("Updating %s to %s\n", name, image)
			img := image
			updateResult, err := ServiceUpdate(pd, dc, svc, name, ServiceUpdateOptions{Image: &img})
			if err != nil {
				res.Status = "failed"
				res.Err = err
			} else {
				res.Status = "updated"
				res.Warnings = updateResult.Warnings
			}
			results = append(results, res)
		}
	}
	return results
}

// swarmServicesOfEntry returns the swarm services a SERVICES_DATA entry
// stands for, by exact name: Docker's name filter matches prefixes, so
// "garage" would otherwise also find "garage_webui".
func swarmServicesOfEntry(dc *pt.DockerClient, entry string) ([]swarm.Service, error) {
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "app=osi4iot")
	filterArgs.Add("name", entry)
	list, err := dc.Cli.ServiceList(dc.Ctx, types.ServiceListOptions{Filters: filterArgs})
	if err != nil {
		return nil, fmt.Errorf("error listing services: %v", err)
	}
	matched := []swarm.Service{}
	for _, svc := range list {
		name := svc.Spec.Name
		if name == entry || (entry == "nats" && natsServiceRe.MatchString(name)) {
			matched = append(matched, svc)
		}
	}
	sort.Slice(matched, func(i, j int) bool { return matched[i].Spec.Name < matched[j].Spec.Name })
	return matched, nil
}

// imageWithoutDigest drops the "@sha256:..." Swarm pins to the image it
// resolved, so the running image compares with the one in the state.
func imageWithoutDigest(image string) string {
	if i := strings.Index(image, "@"); i >= 0 {
		return image[:i]
	}
	return image
}

func containsEntry(list []string, value string) bool {
	for _, v := range list {
		if v == value {
			return true
		}
	}
	return false
}
