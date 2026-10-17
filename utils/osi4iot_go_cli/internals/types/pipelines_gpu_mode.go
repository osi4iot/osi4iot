package types

import (
	"fmt"
	"strings"
)

// Pipelines GPU modes (PlatformInfo.PipelinesGPUMode, PIPELINES_GPU_MODE):
//
//   - auto: GPU image on every replica. Replicas that land on a GPU node
//     run the ONNX models on CUDA, the rest on CPU, and digital twins
//     with pipelineRequiresGpu only run on the former. Replicas are
//     spread over GPU and non-GPU nodes. For mixed clusters.
//   - gpu_only: as auto, but every replica is constrained to GPU nodes.
//   - off: CPU image and CPU inference; GPU nodes are ignored.
//
// Kept here, next to the field, so that the state-file defaults
// (utils) and the service spec (services) share one definition.
const (
	PipelinesGPUAuto = "auto"
	PipelinesGPUOnly = "gpu_only"
	PipelinesGPUOff  = "off"

	DefaultPipelinesGPUMode = PipelinesGPUAuto
)

var PipelinesGPUModes = []string{PipelinesGPUAuto, PipelinesGPUOnly, PipelinesGPUOff}

// NormalizePipelinesGPUMode validates a mode and returns it trimmed and in
// lower case; "" means the default.
func NormalizePipelinesGPUMode(mode string) (string, error) {
	m := strings.ToLower(strings.TrimSpace(mode))
	if m == "" {
		return DefaultPipelinesGPUMode, nil
	}
	for _, valid := range PipelinesGPUModes {
		if m == valid {
			return m, nil
		}
	}
	return "", fmt.Errorf("invalid pipelines GPU mode %q (valid: %s)", mode, strings.Join(PipelinesGPUModes, ", "))
}
