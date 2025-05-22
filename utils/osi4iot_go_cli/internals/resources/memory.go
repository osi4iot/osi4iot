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
	}

	return memory

	// roleMemoryBytesMap := nodeRoleMaps.RoleMemoryBytesMap
	// memory := 100
	// switch serviceName {
	// case "system_prune":
	// 	memory = 50
	// case "traefik":
	// 	memory = 250
	// case "mosquitto":
	// 	memory = 500
	// case "nats":
	// 	memory = 500
	// 	memory = 2048 // OJO luego quitar
	// case "auth_callout":
	// 	memory = 250
	// case "postgres":
	// 	memory = 500
	// case "timescaledb":
	// 	memory = 500
	// 	memory = 4096 // OJO luego quitar
	// case "s3_storage":
	// 	memory = 250
	// case "dev2pdb":
	// 	memory = 500
	// 	memory = 2048 // OJO luego quitar
	// case "grafana":
	// 	memory = 500
	// case "admin_api":
	// 	memory = 1000
	// case "frontend":
	// 	memory = 500
	// case "agent":
	// 	memory = 100
	// case "portainer":
	// 	memory = 100
	// case "pgadmin4":
	// 	memory = 500
	// case "minio":
	// 	memory = 500
	// case "grafana_renderer":
	// 	memory = 500
	// case "keepalived":
	// 	memory = 50
	// case "nodered_instance":
	// 	var gbytes int64 = 1024 * 1024 * 1024
	// 	if roleMemoryBytesMap["Generic org worker"] <= 2*gbytes || roleMemoryBytesMap["Exclusive org worker"] <= 2*gbytes {
	// 		memory = 2048
	// 	} else {
	// 		memory = 4096
	// 	}
	// default:
	// 	memory = 100
	// }

	// return int64(memory * 1024 * 1024)
}
