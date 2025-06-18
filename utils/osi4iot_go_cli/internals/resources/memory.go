package resources

import (
	"strconv"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func Memory(serviceName string, svcResourcesMap SvcResourcesMap) int64 {
	memory := svcResourcesMap.SvcMemoryBytesMap[serviceName]
	return memory
}

func getMemoryBytesSvcMap(pd *pt.PlatformData) map[string]int64 {
	memoryBytesSvcMap := make(map[string]int64)
	nodesData := pd.PlatformInfo.NodesData
	numNodes := len(nodesData)
	deploymentLocation := pd.PlatformInfo.DeploymentLocation

	messagingSvcMemStr := strings.Split(pd.PlatformInfo.MessagingSvcResources, "-")[1]
	messagingSvcMem, _ := strconv.ParseFloat(messagingSvcMemStr[0:len(messagingSvcMemStr)-2], 64)
	iotDataStorageSvcMemStr := strings.Split(pd.PlatformInfo.IotDataStorageSvcResources, "-")[1]
	iotDataStorageSvcMem, _ := strconv.ParseFloat(iotDataStorageSvcMemStr[0:len(iotDataStorageSvcMemStr)-2], 64)
	adminDataStorageSvcMemStr := strings.Split(pd.PlatformInfo.AdminDataStorageSvcResources, "-")[1]
	adminDataStorageSvcMem, _ := strconv.ParseFloat(adminDataStorageSvcMemStr[0:len(adminDataStorageSvcMemStr)-2], 64)
	uiSvcMemStr := strings.Split(pd.PlatformInfo.UiSvcResources, "-")[1]
	uiSvcMem, _ := strconv.ParseFloat(uiSvcMemStr[0:len(uiSvcMemStr)-2], 64)

	systemPruneMemory := int64(100 * 1024 * 1024) // 100 MB
	var keepalivedMemory int64 = 0
	if numNodes > 1 && deploymentLocation == "On-premise cluster deployment" {
		keepalivedMemory = int64(250 * 1024 * 1024) // 250 MB
	}

	memoryBytesSvcMap["system_prune"] = systemPruneMemory
	memoryBytesSvcMap["keepalived"] = keepalivedMemory
	memoryBytesSvcMap["grafana"] = int64(uiSvcMem * 1024 * 1024)
	memoryBytesSvcMap["traefik"] = int64(uiSvcMem * 1024 * 1024)

	memoryBytesSvcMap["mosquitto"] = int64(messagingSvcMem * 1024 * 1024)
	memoryBytesSvcMap["nats"] = int64(messagingSvcMem * 1024 * 1024)
	memoryBytesSvcMap["auth_callout"] = int64(0.25 * iotDataStorageSvcMem * 1024 * 1024)
	memoryBytesSvcMap["dev2pdb"] = int64(0.50 * iotDataStorageSvcMem * 1024 * 1024)

	memoryBytesSvcMap["timescaledb"] = int64(iotDataStorageSvcMem * 1024 * 1024)
	
	memoryBytesSvcMap["postgres"] = int64(adminDataStorageSvcMem * 1024 * 1024)
	memoryBytesSvcMap["s3_storage"] = int64(0.5 * adminDataStorageSvcMem * 1024 * 1024)
	memoryBytesSvcMap["minio"] = int64(adminDataStorageSvcMem * 1024 * 1024)
	memoryBytesSvcMap["admin_api"] = int64(uiSvcMem * 1024 * 1024)
	memoryBytesSvcMap["frontend"] = int64(uiSvcMem * 1024 * 1024)
	memoryBytesSvcMap["pgadmin4"] = int64(0.5 * uiSvcMem * 1024 * 1024)
	memoryBytesSvcMap["grafana_renderer"] = int64(0.5 * uiSvcMem * 1024 * 1024)

	memoryBytesSvcMap["nodered_instance"] = int64(2000 * 1024 * 1024) // 2000 MB

	return memoryBytesSvcMap
}