package resources

import (
	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

type SvcResources struct {
	MemoryBytes int64
	NanoCPUs    int64
	ReplicasPtr *uint64
}

func GetNodeRoleNumMap(platformData *pt.PlatformData) map[string]int {
	roleNumMap := make(map[string]int)
	roleNumMap["Manager"] = 0
	roleNumMap["Platform worker"] = 0
	roleNumMap["NFS server"] = 0
	nodesData := platformData.PlatformInfo.NodesData

	for _, node := range nodesData {
		nodeRole := node.NodeRole
		switch nodeRole {
		case "Manager":
			roleNumMap["Manager"] += 1
		case "Platform worker":
			roleNumMap["Platform worker"] += 1
		case "NfsWorker":
			roleNumMap["NFS server"] += 1
		}
	}

	return roleNumMap
}

func getServiceReplicasPtr(pd *pt.PlatformData, serviceName string) *uint64 {
	services := pd.PlatformInfo.ServicesData
	nodeRoleNumMap := GetNodeRoleNumMap(pd)
	for _, svc := range services {
		if svc.ServiceName == serviceName {
			numReplicas := svc.Replicas
			if serviceName == "nats"  {
				numReplicas = 1
			}
			replics := uint64(numReplicas)
			if serviceName == "traefik" && nodeRoleNumMap["Manager"] > int(replics) {
				replics = uint64(nodeRoleNumMap["Manager"])
			}
			return &replics
		}
	}
	replics := uint64(1)

	return &replics
}

func NewSvcResourcesMap(pd *pt.PlatformData) map[string]SvcResources {
	svcResourcesMap := make(map[string]SvcResources)

	serviceList := []string{
		"system_prune",
		"traefik",
		"nats",
		"auth_callout",
		"postgres",
		"timescaledb",
		"pipelines",
		"grafana",
		"admin_api",
		"frontend",
		"agent",
		"portainer",
		"pgadmin4",
		"minio",
		"grafana_renderer",
		"keepalived",
	}

	for _, svcName := range serviceList {
		svcResources := SvcResources{
			MemoryBytes: GetMemoryBytes(pd, svcName),
			NanoCPUs:    GetNanoCPU(pd, svcName),
			ReplicasPtr: getServiceReplicasPtr(pd, svcName),
		}
		svcResourcesMap[svcName] = svcResources
	}	

	return svcResourcesMap
}
