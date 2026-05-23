package utils

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"runtime"
	"strings"

	"github.com/osi4iot/osi4iot/utils/osi4iot/internals/types"
	"github.com/shirou/gopsutil/mem"
)

func GetLocalNodeData() (types.NodeData, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return types.NodeData{}, err
	}

	usr, err := user.Current()
	if err != nil {
		return types.NodeData{}, err
	}

	cmd := exec.Command("uname", "-m")
	output, err := cmd.Output()
	if err != nil {
		return types.NodeData{}, err
	}
	nodeArch := strings.TrimSpace(string(output))

	localIP, err := GetLocalNodeIP()
	if err != nil {
		return types.NodeData{}, fmt.Errorf("error getting local node IP: %v", err)
	}

	nodeNanoCpus := int64(runtime.NumCPU() * 1e9)

	vm, err := mem.VirtualMemory()
	if err != nil {
		return types.NodeData{}, fmt.Errorf("error getting memory: %v", err)
	}

	nodeData := types.NodeData{
		NodeHostName:    hostname,
		NodeIP:          localIP,
		NodeUserName:    usr.Username,
		NodeRole:        "Manager",
		NodeArch:        nodeArch,
		NodeNanoCPUs:    nodeNanoCpus,
		NodeMemoryBytes: int64(vm.Total),
	}
	return nodeData, nil
}