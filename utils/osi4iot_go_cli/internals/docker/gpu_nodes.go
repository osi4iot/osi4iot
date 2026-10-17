package docker

import (
	"fmt"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
)

// GPU nodes
//
// Swarm cannot ask for a GPU the way `docker run --gpus` does: the
// service spec has no DeviceRequests. What it CAN do is run the task with
// the daemon's default runtime, so a node offers its GPUs to Swarm tasks
// only when the NVIDIA Container Toolkit is installed AND "nvidia" is the
// daemon's default runtime:
//
//	sudo nvidia-ctk runtime configure --runtime=docker --set-as-default
//	sudo systemctl restart docker
//
// With that in place, any container started there that carries
// NVIDIA_VISIBLE_DEVICES gets the driver libraries and /dev/nvidia*
// injected; containers without that variable are untouched, so making
// nvidia the default runtime is harmless for the rest of the platform.
//
// detectNodeGPUs asks every node's daemon which runtime it uses and
// records the result in NodesData[i].NodeGPU, which addNodesLabels turns
// into the gpu=nvidia node label and services.PipelinesService into the
// GPU image and environment.

// GPULabel is the node label carrying the GPU vendor of a node.
const GPULabel = "gpu"

// detectNodeGPUs fills NodeGPU for every node whose daemon can be reached.
// A node that cannot be reached keeps what the state file already said:
// a worker being down must not move the pipelines off the GPU nodes.
func detectNodeGPUs(pd *types.PlatformData) {
	for i, node := range pd.PlatformInfo.NodesData {
		dc, ok := types.DCMap[node.NodeIP]
		if !ok || dc == nil {
			continue
		}
		info, err := dc.Cli.Info(dc.Ctx)
		if err != nil {
			continue
		}

		gpu := ""
		_, hasNvidiaRuntime := info.Runtimes["nvidia"]
		switch {
		case info.DefaultRuntime == "nvidia":
			gpu = "nvidia"
		case hasNvidiaRuntime:
			// Installed but not the default: `docker run --gpus` would
			// work on this node, Swarm tasks never will. Worth saying,
			// because from the outside it looks like a GPU node.
			fmt.Printf("\nWarning: node %s has the nvidia runtime but it is not Docker's "+
				"default runtime, so Swarm services cannot use its GPU.\n"+
				"Run 'sudo nvidia-ctk runtime configure --runtime=docker --set-as-default' "+
				"and restart Docker on that node.\n", node.NodeIP)
		}
		pd.PlatformInfo.NodesData[i].NodeGPU = gpu
	}
}
