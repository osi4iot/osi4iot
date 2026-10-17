package docker

import (
	"fmt"
	"strings"

	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/services"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

// PipelinesGPUModeResult says what SetPipelinesGPUMode did.
type PipelinesGPUModeResult struct {
	Spec     services.PipelinesGPUSpec
	Applied  bool // the running service was updated
	Warnings string
}

// SetPipelinesGPUMode stores PIPELINES_GPU_MODE in the state file and,
// when the pipelines service is deployed, updates its image, GPU
// environment and placement with a rolling update. With the platform
// stopped it only stores the mode: 'osi4iot run' deploys with it.
//
// The state file is written only after the service update succeeds, so a
// failed update leaves state and service as they were.
func SetPipelinesGPUMode(pd *pt.PlatformData, dc *pt.DockerClient, mode string) (PipelinesGPUModeResult, error) {
	res := PipelinesGPUModeResult{}
	mode, err := pt.NormalizePipelinesGPUMode(mode)
	if err != nil {
		return res, err
	}

	var service *swarm.Service
	if dc != nil {
		service, _ = utils.GetSwarmServiceByName(dc, "pipelines")
	}
	if service != nil {
		// Detect the GPU nodes again and refresh their gpu=nvidia label:
		// a GPU added since the last 'osi4iot run' counts, and gpu_only
		// cannot be left pointing at a label no node carries. Done before
		// the mode is set: this may write the state file.
		if err := addNodesLabels(pd); err != nil {
			return res, fmt.Errorf("error refreshing the node labels: %v", err)
		}
	}

	previous := pd.PlatformInfo.PipelinesGPUMode
	pd.PlatformInfo.PipelinesGPUMode = mode
	res.Spec = services.PipelinesGPUSpecFor(pd, resources.GetNodeRoleNumMap(pd))
	res.Warnings = pipelinesGPUModeWarnings(res.Spec)

	if service != nil {
		res.Warnings += pipelinesImageWarning(res.Spec)

		placement := swarm.Placement{}
		if service.Spec.TaskTemplate.Placement != nil {
			placement = *service.Spec.TaskTemplate.Placement
		}
		placement.Constraints = res.Spec.Constraints
		placement.Preferences = nil
		for _, d := range res.Spec.Spread {
			placement.Preferences = append(placement.Preferences,
				swarm.PlacementPreference{Spread: &swarm.SpreadOver{SpreadDescriptor: d}})
		}

		env := map[string]string{}
		for _, kv := range res.Spec.Env {
			parts := strings.SplitN(kv, "=", 2)
			env[parts[0]] = parts[1]
		}
		image := res.Spec.Image

		updateResult, err := ServiceUpdate(pd, dc, service, "pipelines", ServiceUpdateOptions{
			Image:     &image,
			Env:       env,
			RemoveEnv: res.Spec.RemoveEnv,
			Placement: &placement,
		})
		if err != nil {
			pd.PlatformInfo.PipelinesGPUMode = previous
			return res, fmt.Errorf("error updating pipelines service: %v", err)
		}
		res.Warnings += updateResult.Warnings
		res.Applied = true
	}

	if err := utils.WritePlatformDataToFile(pd); err != nil {
		return res, fmt.Errorf("error writing platform data to file: %v", err)
	}
	return res, nil
}

func pipelinesGPUModeWarnings(spec services.PipelinesGPUSpec) string {
	if spec.Mode != pt.PipelinesGPUOff && spec.GPUNodes == 0 {
		return "  - None of the nodes pipelines can run on has a usable GPU, so pipelines runs on CPU.\n" +
			"    A GPU node needs the NVIDIA Container Toolkit with nvidia as Docker's default runtime;\n" +
			"    once it has it, run this command again.\n"
	}
	return ""
}

// pipelinesImageWarning flags images the mode cannot switch: those pinned
// by digest keep whatever flavor they are.
func pipelinesImageWarning(spec services.PipelinesGPUSpec) string {
	if strings.Contains(spec.Image, "@") {
		return fmt.Sprintf("  - The pipelines image is pinned by digest (%s): it is kept as is. "+
			"Make sure it is the %s image.\n", spec.Image, map[bool]string{true: "GPU", false: "CPU"}[spec.UsesGPU])
	}
	return ""
}
