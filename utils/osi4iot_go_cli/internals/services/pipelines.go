package services

import (
	"strings"

	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/swarm"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/resources"
	pt "github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/utils"
)

const pipelinesCPUImage = "ghcr.io/osi4iot/pipelines:1.3.0"

func PipelinesService(
	pd *pt.PlatformData,
	sd pt.SwarmData,
	svcResources resources.SvcResources,
	nodeRoleNumMaps map[string]int,
) pt.Service {
	volName := "pipelines_data_{{.Task.Slot}}"

	secrets := []*swarm.SecretReference{
		{
			File: &swarm.SecretReferenceFileTarget{
				Name: "/pipelines/config.yaml",
				UID:  "0",
				GID:  "0",
				Mode: 0444,
			},
			SecretID:   sd.Secrets["pipelines_config"].ID,
			SecretName: sd.Secrets["pipelines_config"].Name,
		},
	}

	gpu := PipelinesGPUSpecFor(pd, nodeRoleNumMaps)

	env := []string{"REPLICA={{.Task.Slot}}"}
	env = append(env, gpu.Env...)

	image := gpu.Image
	return NewService("pipelines", pd, sd).
		WithImage(image).
		WithEnv(env).
		WithSecrets(secrets).
		WithMounts([]mount.Mount{
			{
				Type:   mount.TypeVolume,
				Source: volName,
				Target: "/pipelines/data",
			},
		}).
		WithResources(
			svcResources.NanoCPUs,
			svcResources.MemoryBytes,
		).
		WithPlacement(gpu.Constraints).
		WithPlacementPreferences(gpu.Spread).
		WithModeReplicated(svcResources.ReplicasPtr).
		WithNetworks([]swarm.NetworkAttachmentConfig{
			{Target: sd.Networks["internal_net"].Name},
			{Target: sd.Networks["nats_network"].Name},
		}).
		Build()
}

const (
	pipelinesGPUTagSfx  = "-gpu"
	pipelinesDefaultTag = "latest"
)

// pipelinesGPUEnvKeys are the variables the GPU mode owns: whatever the
// mode does not set is removed from the service.
var pipelinesGPUEnvKeys = []string{
	"NVIDIA_VISIBLE_DEVICES",
	"NVIDIA_DRIVER_CAPABILITIES",
	"ORT_EXECUTION_PROVIDER",
}

// PipelinesGPUSpec is the GPU-dependent part of the pipelines service.
type PipelinesGPUSpec struct {
	Mode     string // normalized mode
	GPUNodes int    // GPU nodes among those pipelines may run on
	UsesGPU  bool   // GPU image and CUDA (mode is not off and there are GPU nodes)

	Image       string
	Env         []string // KEY=VALUE
	RemoveEnv   []string // keys of pipelinesGPUEnvKeys that Env does not set
	Constraints []string // all placement constraints of the service
	Spread      []string // placement preferences (spread descriptors)
}

// PipelinesGPUSpecFor decides image, environment and placement of the
// pipelines service from PIPELINES_GPU_MODE and from how many of the
// nodes it may run on have a GPU.
//
// Swarm has no --gpus: a task reaches the GPU because the node's default
// runtime is nvidia and the container asks for devices through
// NVIDIA_VISIBLE_DEVICES. On a node without the nvidia runtime that
// variable means nothing to runc, so setting it on every replica is safe
// and lets the same spec run on mixed clusters.
func PipelinesGPUSpecFor(pd *pt.PlatformData, nodeRoleNumMaps map[string]int) PipelinesGPUSpec {
	mode, err := pt.NormalizePipelinesGPUMode(pd.PlatformInfo.PipelinesGPUMode)
	if err != nil {
		mode = pt.DefaultPipelinesGPUMode
	}

	constraints := []string{
		"node.role==worker",
		"node.labels.platform_worker==true",
	}
	gpuRole := "Platform worker"
	if nodeRoleNumMaps["Platform worker"] == 0 {
		constraints = []string{"node.role==manager"}
		gpuRole = "Manager"
	}

	gpuNodes := 0
	for _, node := range pd.PlatformInfo.NodesData {
		if node.NodeGPU != "" && node.NodeRole == gpuRole {
			gpuNodes++
		}
	}

	s := PipelinesGPUSpec{Mode: mode, GPUNodes: gpuNodes}
	s.UsesGPU = mode != pt.PipelinesGPUOff && gpuNodes > 0

	if !s.UsesGPU {
		s.Env = []string{"ORT_EXECUTION_PROVIDER=cpu"}
	} else {
		s.Env = []string{
			"NVIDIA_VISIBLE_DEVICES=all",
			"NVIDIA_DRIVER_CAPABILITIES=compute,utility",
			// auto: CUDA where a GPU is visible, CPU otherwise.
			"ORT_EXECUTION_PROVIDER=auto",
		}
		if mode == pt.PipelinesGPUOnly {
			constraints = append(constraints, "node.labels.gpu==nvidia")
		} else {
			// auto: digital twins with pipelineRequiresGpu run only on the
			// replicas that landed on a GPU node. Spreading over the gpu
			// label puts half the replicas on GPU nodes, so with 2 or more
			// replicas at least one gets a GPU; left alone, Swarm could put
			// them all on CPU nodes.
			s.Spread = []string{"node.labels.gpu"}
		}
	}
	s.Constraints = constraints

	set := map[string]bool{}
	for _, kv := range s.Env {
		set[strings.SplitN(kv, "=", 2)[0]] = true
	}
	for _, key := range pipelinesGPUEnvKeys {
		if !set[key] {
			s.RemoveEnv = append(s.RemoveEnv, key)
		}
	}

	stored := utils.GetServiceImage(pd, "pipelines", pipelinesCPUImage)
	s.Image = PipelinesImageFlavor(stored, s.UsesGPU)
	return s
}

// PipelinesImageFlavor turns a pipelines image into its GPU or CPU
// flavor, keeping repository and version: the GPU image is the CPU tag
// plus "-gpu" (pipelines:1.3.0 <-> pipelines:1.3.0-gpu). Images pinned by
// digest are returned unchanged: there is no tag to derive the other one
// from.
func PipelinesImageFlavor(image string, gpu bool) string {
	if image == "" || strings.Contains(image, "@") {
		return image
	}
	repo, tag := image, pipelinesDefaultTag
	if i := strings.LastIndex(image, ":"); i > strings.LastIndex(image, "/") {
		repo, tag = image[:i], image[i+1:]
	}
	tag = strings.TrimSuffix(tag, pipelinesGPUTagSfx)
	if gpu {
		tag += pipelinesGPUTagSfx
	}
	return repo + ":" + tag
}
