package services

import (
	"fmt"
	"strconv"
)

// Memory of the pipelines containers
//
// pipelines is Go plus a lot of C: ONNX Runtime and its CUDA stack, the
// tokenizers of the knowledge bases, DuckDB. Measured with YOLO on CUDA,
// the C side (malloc heap, CUDA driver) is about half of the container's
// memory. Two settings keep it inside the service's memory limit:
//
//   - GOMEMLIMIT: the Go garbage collector works harder as the Go heap
//     nears it, instead of letting it grow until the container is killed.
//     It only counts Go's memory, so it is a share of the limit that
//     leaves the rest to the C libraries: 60%.
//   - MALLOC_ARENA_MAX=2: glibc creates a malloc arena per thread, and
//     ONNX Runtime runs many threads; two arenas cut the fragmentation of
//     the C heap a lot, at no measurable cost for pipelines.

// PipelinesGoMemoryShare is the share of the memory limit given to Go.
const PipelinesGoMemoryShare = 0.60

// pipelinesMallocArenaMax caps glibc's malloc arenas.
const pipelinesMallocArenaMax = 2

// PipelinesMemoryEnv returns the memory settings of pipelines for a memory
// limit in bytes. Without a limit (0) GOMEMLIMIT is not set: there is
// nothing to keep under.
func PipelinesMemoryEnv(limitBytes int64) map[string]string {
	env := map[string]string{"MALLOC_ARENA_MAX": strconv.Itoa(pipelinesMallocArenaMax)}
	if limitBytes > 0 {
		mib := int64(float64(limitBytes)*PipelinesGoMemoryShare) / (1 << 20)
		if mib > 0 {
			env["GOMEMLIMIT"] = fmt.Sprintf("%dMiB", mib)
		}
	}
	return env
}
