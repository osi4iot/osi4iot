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

func CPUsForClusterDeployment(serviceName string, roleNanoCPUsMap map[string]int64) int64 {
	cpus := 0.25
	switch serviceName {
	case "system_prune":
		cpus = 0.25
	case "traefik":
		if roleNanoCPUsMap["Manager"] <= 10*1e9 {
			cpus = 0.25 * 1.0e9 / float64(roleNanoCPUsMap["Manager"])
		} else {
			cpus = 4.0
		}
	case "grafana":
		if roleNanoCPUsMap["Manager"] <= 10*1e9 {
			cpus = 0.25 * 1.0e9 / float64(roleNanoCPUsMap["Manager"])
		} else {
			cpus = 4.0
		}
	case "keepalived":
		cpus = 0.25
	case "mosquitto":
		if roleNanoCPUsMap["Platform worker"] <= 16*1e9 {
			cpus = 0.25 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 4.0
		}
	case "nats":
		if roleNanoCPUsMap["Platform worker"] <= 16*1e9 {
			cpus = 0.25 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 4.0
		}
	case "auth_callout":
		if roleNanoCPUsMap["Platform worker"] <= 16*1e9 {
			cpus = 0.0625 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 1.0
		}
	case "postgres":
		if roleNanoCPUsMap["Platform worker"] <= 32*1e9 {
			cpus = 0.125 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 4.0
		}
	case "timescaledb":
		if roleNanoCPUsMap["Platform worker"] <= 32*1e9 {
			cpus = 0.125 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 4.0
		}
	case "s3_storage":
		if roleNanoCPUsMap["Platform worker"] <= 32*1e9 {
			cpus = 0.0625 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 2.0
		}
	case "dev2pdb":
		if roleNanoCPUsMap["Platform worker"] <= 16*1e9 {
			cpus = 0.125 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 2.0
		}
	case "admin_api":
		if roleNanoCPUsMap["Platform worker"] <= 8*1e9 {
			cpus = 0.125 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 1.0
		}
	case "frontend":
		if roleNanoCPUsMap["Platform worker"] <= 8*1e9 {
			cpus = 0.125 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 1.0
		}
	case "pgadmin4":
		if roleNanoCPUsMap["Platform worker"] <= 32*1e9 {
			cpus = 0.0625 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 2.0
		}
	case "minio":
		if roleNanoCPUsMap["Platform worker"] <= 16*1e9 {
			cpus = 0.125 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 2.0
		}
	case "grafana_renderer":
		if roleNanoCPUsMap["Platform worker"] <= 16*1e9 {
			cpus = 0.125 * 1.0e9 / float64(roleNanoCPUsMap["Platform worker"])
		} else {
			cpus = 2.0
		}
	case "nodered_instance":
		if roleNanoCPUsMap["Generic org worker"] <= 8*1e9 {
			cpus = 0.125 * 1.0e9 / float64(roleNanoCPUsMap["Generic org worker"])
		} else {
			cpus = 1.0
		}
	default:
		cpus = 0.25
	}
	return int64(cpus * 1.0e9)
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
}
