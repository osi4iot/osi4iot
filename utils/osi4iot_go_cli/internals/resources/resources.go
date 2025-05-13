package resources

import (

	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

type NodesRoleMaps struct {
	NodeRoleNumMap     map[string]int
	RoleMemoryBytesMap map[string]int64
	RoleNanoCPUsMap    map[string]int64
}

func NewNodeRoleMaps(pd *pt.PlatformData) NodesRoleMaps {
	nodeRoleMaps := NodesRoleMaps{
		NodeRoleNumMap:     getNodeRoleNumMap(pd),
		RoleMemoryBytesMap: getNodeMemoryBytesMap(pd),
		RoleNanoCPUsMap:    getNodeNanoCpusMap(pd),
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

func getNodeNanoCpusMap(platformData *pt.PlatformData) map[string]int64 {
	roleNanoCpusMap := make(map[string]int64)
	roleNanoCpusMap["Manager"] = 0
	roleNanoCpusMap["Platform worker"] = 0
	roleNanoCpusMap["Generic org worker"] = 0
	roleNanoCpusMap["Exclusive org worker"] = 0
	roleNanoCpusMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData

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

	return roleNanoCpusMap
}

func getNodeMemoryBytesMap(platformData *pt.PlatformData) map[string]int64 {
	roleMemoryBytesMap := make(map[string]int64)
	roleMemoryBytesMap["Manager"] = 0
	roleMemoryBytesMap["Platform worker"] = 0
	roleMemoryBytesMap["Generic org worker"] = 0
	roleMemoryBytesMap["Exclusive org worker"] = 0
	roleMemoryBytesMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData

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

	return roleMemoryBytesMap
}

func CPUs(serviceName string, nodeRoleMaps NodesRoleMaps) int64 {
	roleNanoCPUsMap := nodeRoleMaps.RoleNanoCPUsMap
	nodeRoleNumMap := nodeRoleMaps.NodeRoleNumMap

	cpus := 0.25
	switch serviceName {
	case "system_prune":
		cpus = 0.25
	case "traefik":
		if nodeRoleNumMap["Manager"] == 1 {
			if roleNanoCPUsMap["Manager"] <= 2*1e9 {
				cpus = 0.15
			} else {
				cpus = 0.25
			}
		} else {
			cpus = 0.50
		}
	case "mosquitto":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.30
		} else {
			cpus = 0.50
		}
	case "nats":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.30
		} else {
			cpus = 0.50
		}
		cpus = 2.0 // OJO luego verificar
	case "auth_callout":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.15
		} else {
			cpus = 0.50
		}
	case "postgres":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.25
		} else {
			cpus = 0.50
		}
	case "timescaledb":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.25
		} else {
			cpus = 0.50
		}
		cpus = 4.0 // OJO luego verificar
	case "s3_storage":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.15
		} else {
			cpus = 0.50
		}
	case "dev2pdb":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.15
		} else {
			cpus = 0.50
		}
		cpus = 2.0 // OJO luego verificar
	case "grafana":
		if nodeRoleNumMap["Manager"] == 1 {
			if roleNanoCPUsMap["Manager"] <= 2*1e9 {
				cpus = 0.2
			} else {
				cpus = 0.50
			}
		} else {
			cpus = 0.50
		}
	case "admin_api":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.30
		} else {
			cpus = 0.50
		}
	case "frontend":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.25
		} else {
			cpus = 0.50
		}
	case "agent":
		cpus = 0.10
	case "portainer":
		cpus = 0.10
	case "pgadmin4":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.15
		} else {
			cpus = 0.25
		}
	case "minio":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.30
		} else {
			cpus = 0.50
		}
	case "grafana_renderer":
		if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
			cpus = 0.25
		} else {
			cpus = 0.50
		}
	case "keepalived":
		cpus = 0.25
	case "nodered_instance":
		cpus = 0.50
	default:
		cpus = 0.25
	}
	return int64(cpus * 1e9)
}

func Memory(serviceName string, nodeRoleMaps NodesRoleMaps) int64 {
	roleMemoryBytesMap := nodeRoleMaps.RoleMemoryBytesMap
	memory := 100
	switch serviceName {
	case "system_prune":
		memory = 50
	case "traefik":
		memory = 250
	case "mosquitto":
		memory = 500
	case "nats":
		//memory = 500
		memory = 2000 // OJO luego verificar
	case "auth_callout":
		memory = 250
	case "postgres":
		memory = 500
	case "timescaledb":
		//memory = 500
		memory = 8000 // OJO luego verificar
	case "s3_storage":
		memory = 250
	case "dev2pdb":
		//memory = 500
		memory = 2000 // OJO luego verificar
	case "grafana":
		memory = 500
	case "admin_api":
		memory = 1000
	case "frontend":
		memory = 500
	case "agent":
		memory = 100
	case "portainer":
		memory = 100
	case "pgadmin4":
		memory = 500
	case "minio":
		memory = 500
	case "grafana_renderer":
		memory = 500
	case "keepalived":
		memory = 50
	case "nodered_instance":
		var gbytes int64 = 1024 * 1024 * 1024
		if roleMemoryBytesMap["Generic org worker"] <= 2*gbytes || roleMemoryBytesMap["Exclusive org worker"] <= 2*gbytes {
			memory = 2048
		} else {
			memory = 4096
		}
	default:
		memory = 100
	}

	return int64(memory * 1024 * 1024)
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
