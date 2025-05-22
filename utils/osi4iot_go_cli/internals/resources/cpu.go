package resources

func CPUsForLocalDeployment(serviceName string, totalCpu int64) int64 {
	cpusPorcentage := 0.04
	switch serviceName {
	case "system_prune":
		cpusPorcentage = 0.04
	case "traefik":
		cpusPorcentage = 0.06
	case "mosquitto":
		cpusPorcentage = 0.09
	case "nats":
		if totalCpu >= 30.5*1e9 {
			cpusPorcentage = 0.13
		} else {
			cpusPorcentage = 0.06
		}
	case "auth_callout":
		cpusPorcentage = 0.03
	case "postgres":
		cpusPorcentage = 0.06
	case "timescaledb":
		if totalCpu >= 30.5*1e9 {
			cpusPorcentage = 0.13
		} else {
			cpusPorcentage = 0.06
		}
	case "s3_storage":
		cpusPorcentage = 0.03
	case "dev2pdb":
		cpusPorcentage = 0.06
	case "grafana":
		cpusPorcentage = 0.06
	case "admin_api":
		if totalCpu >= 30.5*1e9 {
			cpusPorcentage = 0.03
		} else {
			cpusPorcentage = 0.06
		}
	case "frontend":
		cpusPorcentage = 0.06
	case "pgadmin4":
		cpusPorcentage = 0.03
	case "minio":
		cpusPorcentage = 0.06
	case "grafana_renderer":
		cpusPorcentage = 0.06
	case "nodered_instance":
		cpusPorcentage = 0.06
	default:
		cpusPorcentage = 0.04
	}
	return int64(cpusPorcentage * float64(totalCpu))
}

func CPUs(serviceName string, nodeRoleMaps NodesRoleMaps) int64 {
	roleNanoCPUsMap := nodeRoleMaps.RoleNanoCPUsMap
	nodeRoleNumMap := nodeRoleMaps.NodeRoleNumMap
	numNodes := 0
	for _, num := range nodeRoleNumMap {
		numNodes += num
	}
	
    cpus := int64(0.25 * 1e9)
	if numNodes == 1 {
		totalCpu := roleNanoCPUsMap["Manager"]
		cpus = CPUsForLocalDeployment(serviceName, totalCpu)
	} else {

	}

	return cpus

	// cpus := 0.25
	// switch serviceName {
	// case "system_prune":
	// 	cpus = 0.25
	// case "traefik":
	// 	if nodeRoleNumMap["Manager"] == 1 {
	// 		if roleNanoCPUsMap["Manager"] <= 2*1e9 {
	// 			cpus = 0.15
	// 		} else {
	// 			cpus = 0.25
	// 		}
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "mosquitto":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.30
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "nats":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.30
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// 	cpus = 4.0 // OJO luego quitar
	// case "auth_callout":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.15
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "postgres":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.25
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "timescaledb":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.25
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// 	cpus = 4.0 // OJO luego quitar
	// case "s3_storage":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.15
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "dev2pdb":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.15
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// 	cpus = 2.0 // OJO luego quitar
	// case "grafana":
	// 	if nodeRoleNumMap["Manager"] == 1 {
	// 		if roleNanoCPUsMap["Manager"] <= 2*1e9 {
	// 			cpus = 0.2
	// 		} else {
	// 			cpus = 0.50
	// 		}
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "admin_api":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.30
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "frontend":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.25
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "agent":
	// 	cpus = 0.10
	// case "portainer":
	// 	cpus = 0.10
	// case "pgadmin4":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.15
	// 	} else {
	// 		cpus = 0.25
	// 	}
	// case "minio":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.30
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "grafana_renderer":
	// 	if roleNanoCPUsMap["Platform worker"] <= 2*1e9 {
	// 		cpus = 0.25
	// 	} else {
	// 		cpus = 0.50
	// 	}
	// case "keepalived":
	// 	cpus = 0.25
	// case "nodered_instance":
	// 	cpus = 0.50
	// default:
	// 	cpus = 0.25
	// }
	// return int64(cpus * 1e9)
}
