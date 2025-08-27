package resources

import (
	"strconv"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

type SvcResourcesMap struct {
	SvcMemoryBytesMap map[string]int64
	SvcNanoCPUsMap    map[string]int64
}

type NodesRoleMaps struct {
	NodeRoleNumMap     map[string]int
	RoleMemoryBytesMap map[string]int64
	RoleNanoCPUsMap    map[string]int64
}

func NewNodeRoleMaps(pd *pt.PlatformData) NodesRoleMaps {
	nodeRoleMaps := NodesRoleMaps{
		NodeRoleNumMap:     getNodeRoleNumMap(pd),
		RoleMemoryBytesMap: getRoleMemoryBytesMap(pd),
		RoleNanoCPUsMap:    getRoleNanoCpusMap(pd),
	}

	return nodeRoleMaps
}

func getNodeRoleNumMap(platformData *pt.PlatformData) map[string]int {
	roleNumMap := make(map[string]int)
	roleNumMap["Manager"] = 0
	roleNumMap["Platform worker"] = 0
	roleNumMap["Generic org worker"] = 0
	roleNumMap["Exclusive org worker"] = 0
	roleNumMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData

	for _, node := range nodesData {
		nodeRole := node.NodeRole
		switch nodeRole {
		case "Manager":
			roleNumMap["Manager"] += 1
		case "Platform worker":
			roleNumMap["Platform worker"] += 1
		case "Generic org worker":
			roleNumMap["Generic org worker"] += 1
		case "ExclusiveOrgWorker":
			roleNumMap["Exclusive org worker"] += 1
		case "NfsWorker":
			roleNumMap["NFS server"] += 1
		}
	}

	return roleNumMap
}

func getRoleNanoCpusMap(platformData *pt.PlatformData) map[string]int64 {
	roleNanoCpusMap := make(map[string]int64)
	roleNanoCpusMap["Manager"] = 0
	roleNanoCpusMap["Platform worker"] = 0
	roleNanoCpusMap["Generic org worker"] = 0
	roleNanoCpusMap["Exclusive org worker"] = 0
	roleNanoCpusMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData
	numNodes := len(nodesData)

	for _, node := range nodesData {
		nodeRole := node.NodeRole

		switch nodeRole {
		case "Manager":
			if roleNanoCpusMap["Manager"] == 0 {
				roleNanoCpusMap["Manager"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["Manager"] {
				roleNanoCpusMap["Manager"] = node.NodeNanoCPUs
			}
		case "Platform worker":
			if roleNanoCpusMap["Platform worker"] == 0 {
				roleNanoCpusMap["Platform worker"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["Platform worker"] {
				roleNanoCpusMap["Platform worker"] = node.NodeNanoCPUs
			}
		case "Generic org worker":
			if roleNanoCpusMap["Generic org worker"] == 0 {
				roleNanoCpusMap["Generic org worker"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["Generic org worker"] {
				roleNanoCpusMap["Generic org worker"] = node.NodeNanoCPUs
			}
		case "ExclusiveOrgWorker":
			if roleNanoCpusMap["Exclusive org worker"] == 0 {
				roleNanoCpusMap["Exclusive org worker"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["Exclusive org worker"] {
				roleNanoCpusMap["Exclusive org worker"] = node.NodeNanoCPUs
			}
		case "NfsWorker":
			if roleNanoCpusMap["NFS server"] == 0 {
				roleNanoCpusMap["NFS server"] = node.NodeNanoCPUs
			}
			if node.NodeNanoCPUs < roleNanoCpusMap["NFS server"] {
				roleNanoCpusMap["NFS server"] = node.NodeNanoCPUs
			}

		}
	}

	if numNodes == 1 {
		resourceUtilization := float64(platformData.PlatformInfo.LocalResourceUtilization) * 0.01
		roleNanoCpusMap["Manager"] = int64(float64(roleNanoCpusMap["Manager"]) * resourceUtilization)
	}

	return roleNanoCpusMap
}

func getRoleMemoryBytesMap(platformData *pt.PlatformData) map[string]int64 {
	roleMemoryBytesMap := make(map[string]int64)
	roleMemoryBytesMap["Manager"] = 0
	roleMemoryBytesMap["Platform worker"] = 0
	roleMemoryBytesMap["Generic org worker"] = 0
	roleMemoryBytesMap["Exclusive org worker"] = 0
	roleMemoryBytesMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData
	numNodes := len(nodesData)

	for _, node := range nodesData {
		nodeRole := node.NodeRole
		switch nodeRole {
		case "Manager":
			if roleMemoryBytesMap["Manager"] == 0 {
				roleMemoryBytesMap["Manager"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["Manager"] {
				roleMemoryBytesMap["Manager"] = node.NodeMemoryBytes
			}
		case "Platform worker":
			if roleMemoryBytesMap["Platform worker"] == 0 {
				roleMemoryBytesMap["Platform worker"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["Platform worker"] {
				roleMemoryBytesMap["Platform worker"] = node.NodeMemoryBytes
			}
		case "Generic org worker":
			if roleMemoryBytesMap["Generic org worker"] == 0 {
				roleMemoryBytesMap["Generic org worker"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["Generic org worker"] {
				roleMemoryBytesMap["Generic org worker"] = node.NodeMemoryBytes
			}
		case "ExclusiveOrgWorker":
			if roleMemoryBytesMap["Exclusive org worker"] == 0 {
				roleMemoryBytesMap["Exclusive org worker"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["Exclusive org worker"] {
				roleMemoryBytesMap["Exclusive org worker"] = node.NodeMemoryBytes
			}
		case "NfsWorker":
			if roleMemoryBytesMap["NFS server"] == 0 {
				roleMemoryBytesMap["NFS server"] = node.NodeMemoryBytes
			}
			if node.NodeMemoryBytes < roleMemoryBytesMap["NFS server"] {
				roleMemoryBytesMap["NFS server"] = node.NodeMemoryBytes
			}
		}
	}

	if numNodes == 1 {
		resourceUtilization := float64(platformData.PlatformInfo.LocalResourceUtilization) * 0.01
		roleMemoryBytesMap["Manager"] = int64(float64(roleMemoryBytesMap["Manager"]) * resourceUtilization)
	}

	return roleMemoryBytesMap
}

func GiveReplicsPtr(serviceName string, nodeRoleMaps NodesRoleMaps) *uint64 {
	nodeRoleNumMap := nodeRoleMaps.NodeRoleNumMap
	replics := uint64(1)
	switch serviceName {
	case "system_prune":
		replics = uint64(1)
	case "traefik":
		replics = uint64(nodeRoleNumMap["Manager"])
	case "mosquitto_go_auth":
		replics = uint64(1)
	case "nats":
		replics = uint64(1)
	case "auth_callout":
		replics = uint64(1)
	case "postgres":
		replics = uint64(1)
	case "timescaledb":
		replics = uint64(1)
	case "s3_storage":
		replics = uint64(1)
	case "dev2pdb":
		replics = uint64(1)
	case "pipelines":
		replics = uint64(1)
	case "grafana":
		replics = uint64(1)
		if nodeRoleNumMap["Manager"] >= 1 {
			replics = uint64(nodeRoleNumMap["Manager"])
			if nodeRoleNumMap["Manager"] > 3 {
				replics = uint64(3)
			}
		}
	case "admin_api":
		replics = uint64(1)
		if nodeRoleNumMap["Platform worker"] >= 1 {
			replics = uint64(nodeRoleNumMap["Platform worker"])
			if nodeRoleNumMap["Platform worker"] > 3 {
				replics = uint64(3)
			}
		}
	case "frontend":
		replics = uint64(1)
		if nodeRoleNumMap["Platform worker"] >= 1 {
			replics = uint64(nodeRoleNumMap["Platform worker"])
			if nodeRoleNumMap["Platform worker"] > 3 {
				replics = uint64(3)
			}
		}
	case "agent":
		replics = uint64(1)
	case "portainer":
		replics = uint64(1)
	case "pgadmin4":
		replics = uint64(1)
	case "minio":
		replics = uint64(1)
	case "grafana_renderer":
		replics = uint64(1)
	case "keepalived":
		replics = uint64(1)
	case "nodered_instance":
		replics = uint64(1)
	default:
		replics = uint64(1)
	}
	return &replics
}

func NewSvcResourcesMap(pd *pt.PlatformData) SvcResourcesMap {
	resourcesMap := SvcResourcesMap{
		SvcMemoryBytesMap: getMemoryBytesSvcMap(pd),
		SvcNanoCPUsMap:    getNanoCPUsSvcMap(pd),
	}

	return resourcesMap
}

func NriResourceMap(pd *pt.PlatformData) SvcResourcesMap {
	uiSvcCpusStr := strings.Split(pd.PlatformInfo.UiSvcResources, "-")[0]
	uiSvcCpus, _ := strconv.ParseFloat(uiSvcCpusStr[0:len(uiSvcCpusStr)-3], 64)
	nanoCPUsSvcMap := make(map[string]int64)

	if uiSvcCpus <= 1.0 {
		nanoCPUsSvcMap["nodered_instance"] = int64(uiSvcCpus * 1e9)
	} else {
		nanoCPUsSvcMap["nodered_instance"] = int64(1.0 * 1e9)
	}
	
	memoryBytesSvcMap := make(map[string]int64)
	memoryBytesSvcMap["nodered_instance"] = int64(2000 * 1024 * 1024) // 2000 MB

	resourcesMap := SvcResourcesMap{
		SvcMemoryBytesMap: memoryBytesSvcMap,
		SvcNanoCPUsMap:    nanoCPUsSvcMap,
	}

	return resourcesMap
}
