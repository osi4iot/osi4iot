package resources

func MemoryForLocalDeployment(serviceName string, totalMemory int64) int64 {
	memoryPorcentage := 0.04
	switch serviceName {
	case "system_prune":
		if totalMemory < 64e6 {
			memoryPorcentage = 0.01
		} else {
			memoryPorcentage = 0.02
		}
	case "traefik":
		memoryPorcentage = 0.03
	case "mosquitto":
		if totalMemory < 32e6 {
			memoryPorcentage = 0.09
		} else {
			memoryPorcentage = 0.15
		}
	case "nats":
		if totalMemory < 32e6 {
			memoryPorcentage = 0.06
		} else {
			memoryPorcentage = 0.13
		}
	case "auth_callout":
		if totalMemory < 32e6 {
			memoryPorcentage = 0.03
		} else {
			memoryPorcentage = 0.02
		}
	case "postgres":
		memoryPorcentage = 0.06
	case "timescaledb":
		if totalMemory < 32e6 {
			memoryPorcentage = 0.06
		} else {
			memoryPorcentage = 0.13
		}
	case "s3_storage":
		memoryPorcentage = 0.03
	case "dev2pdb":
		memoryPorcentage = 0.06
	case "grafana":
		memoryPorcentage = 0.06
	case "admin_api":
		if totalMemory < 16e6 {
			memoryPorcentage = 0.13
		} else {
			memoryPorcentage = 0.06
		}
	case "frontend":
		memoryPorcentage = 0.06
	case "pgadmin4":
		memoryPorcentage = 0.03
	case "minio":
		if totalMemory < 16e6 {
			memoryPorcentage = 0.06
		} else {
			memoryPorcentage = 0.03
		}
	case "grafana_renderer":
		memoryPorcentage = 0.03
	case "nodered_instance":
		memoryPorcentage = 0.06
		if totalMemory < 32e6 {
			memoryPorcentage = 2.0e9 / float64(totalMemory)
		} else {
			memoryPorcentage = 4.0e9 / float64(totalMemory)
		}
	default:
		memoryPorcentage = 0.04
	}
	return int64(memoryPorcentage * float64(totalMemory))
}

func MemoryForClusterDeployment(serviceName string, roleMemoryBytesMap map[string]int64) int64 {
	var memory int64 = 500 * 1e6
	switch serviceName {
	case "system_prune":
		memory = 500 * 1e6
	case "traefik":
		if roleMemoryBytesMap["Manager"] <= 16000*1e6 {
			memory = int64(0.25 * float64(roleMemoryBytesMap["Manager"]))
		} else {
			memory = 4000 * 1e6
		}
	case "grafana":
		if roleMemoryBytesMap["Manager"] <= 16000*1e6 {
			memory = int64(0.25 * float64(roleMemoryBytesMap["Manager"]))
		} else {
			memory = 4000 * 1e6
		}
	case "keepalived":
		memory = 500 * 1e6
	case "mosquitto":
		if roleMemoryBytesMap["Platform worker"] <= 32000*1e6 {
			memory = int64(0.125 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 4000 * 1e6
		}
	case "nats":
		if roleMemoryBytesMap["Platform worker"] <= 32000*1e6 {
			memory = int64(0.25 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 8000 * 1e6
		}
	case "auth_callout":
		if roleMemoryBytesMap["Platform worker"] <= 32000*1e6 {
			memory = int64(0.0625 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 2000 * 1e6
		}
	case "postgres":
		if roleMemoryBytesMap["Platform worker"] <= 32000*1e6 {
			memory = int64(0.25 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 8000 * 1e6
		}
	case "timescaledb":
		if roleMemoryBytesMap["Platform worker"] <= 32000*1e6 {
			memory = int64(0.25 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 8000 * 1e6
		}
	case "s3_storage":
		if roleMemoryBytesMap["Platform worker"] <= 16000*1e6 {
			memory = int64(0.125 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 2000 * 1e6
		}
	case "dev2pdb":
		if roleMemoryBytesMap["Platform worker"] <= 32000*1e6 {
			memory = int64(0.125 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 4000 * 1e6
		}
	case "admin_api":
		if roleMemoryBytesMap["Platform worker"] <= 16000*1e6 {
			memory = int64(0.125 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 2000 * 1e6
		}
	case "frontend":
		if roleMemoryBytesMap["Platform worker"] <= 16000*1e6 {
			memory = int64(0.125 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 2000 * 1e6
		}
	case "pgadmin4":
		if roleMemoryBytesMap["Platform worker"] <= 16000*1e6 {
			memory = int64(0.125 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 2000 * 1e6
		}
	case "minio":
		if roleMemoryBytesMap["Platform worker"] <= 16000*1e6 {
			memory = int64(0.125 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 2000 * 1e6
		}
	case "grafana_renderer":
		if roleMemoryBytesMap["Platform worker"] <= 16000*1e6 {
			memory = int64(0.125 * float64(roleMemoryBytesMap["Platform worker"]))
		} else {
			memory = 2000 * 1e6
		}
	case "nodered_instance":
		memory = 2040 * 1e6
	default:
		memory = 500 * 1e6
	}
	return memory
}

func Memory(serviceName string, nodeRoleMaps NodesRoleMaps) int64 {
	nodeRoleNumMap := nodeRoleMaps.NodeRoleNumMap
	numNodes := 0
	for _, num := range nodeRoleNumMap {
		numNodes += num
	}

	var memory int64 = 100
	if numNodes == 1 {
		totalMemory := nodeRoleMaps.RoleMemoryBytesMap["Manager"]
		memory = MemoryForLocalDeployment(serviceName, totalMemory)
	} else {
		memory = MemoryForClusterDeployment(serviceName, nodeRoleMaps.RoleMemoryBytesMap)
	}

	return memory
}
