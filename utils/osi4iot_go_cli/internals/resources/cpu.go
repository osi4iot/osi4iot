package resources

import (
	"strconv"
	"strings"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)


func CPUs(serviceName string, svcResourcesMap SvcResourcesMap) int64 {
	cpus := svcResourcesMap.SvcNanoCPUsMap[serviceName]
	return cpus
}

func getNanoCPUsSvcMap(pd *pt.PlatformData) map[string]int64 {
	nanoCPUsSvcMap := make(map[string]int64)
	nodesData := pd.PlatformInfo.NodesData
	numNodes := len(nodesData)
	deploymentLocation := pd.PlatformInfo.DeploymentLocation

	messagingSvcCpusStr := strings.Split(pd.PlatformInfo.MessagingSvcResources, "-")[0]
	messagingSvcCpus, _ := strconv.ParseFloat(messagingSvcCpusStr[0:len(messagingSvcCpusStr)-3], 64)
	iotStorageDataSvcCpusStr := strings.Split(pd.PlatformInfo.IotDataStorageSvcResources, "-")[0]
	iotStorageDataSvcCpus, _ := strconv.ParseFloat(iotStorageDataSvcCpusStr[0:len(iotStorageDataSvcCpusStr)-3], 64)
	adminDataStorageSvcCpusStr := strings.Split(pd.PlatformInfo.AdminDataStorageSvcResources, "-")[0]
	adminDataStorageSvcCpus, _ := strconv.ParseFloat(adminDataStorageSvcCpusStr[0:len(adminDataStorageSvcCpusStr)-3], 64)
	uiSvcCpusStr := strings.Split(pd.PlatformInfo.UiSvcResources, "-")[0]
	uiSvcCpus, _ := strconv.ParseFloat(uiSvcCpusStr[0:len(uiSvcCpusStr)-3], 64)
	pipelinesSvcCpusStr := strings.Split(pd.PlatformInfo.PipelinesSvcResources, "-")[0]
	
	pipelinesSvcCpus, _ := strconv.ParseFloat(pipelinesSvcCpusStr[0:len(pipelinesSvcCpusStr)-3], 64)

	systemPruneCpu := 0.125 * 1e9
	var keepalivedCpu float64 = 0.0
	if numNodes > 1 && deploymentLocation == "On-premise cluster deployment" {
		keepalivedCpu = 0.25 * 1e9
	}

	nanoCPUsSvcMap["system_prune"] = int64(systemPruneCpu)
	nanoCPUsSvcMap["keepalived"] = int64(keepalivedCpu)
	nanoCPUsSvcMap["traefik"] = int64(uiSvcCpus * 1e9)
	nanoCPUsSvcMap["grafana"] = int64(uiSvcCpus * 1e9)

	nanoCPUsSvcMap["mosquitto"] = int64(messagingSvcCpus * 1e9)
	nanoCPUsSvcMap["nats"] = int64(messagingSvcCpus * 1e9)
	nanoCPUsSvcMap["auth_callout"] = int64(0.25 * messagingSvcCpus * 1e9)
	nanoCPUsSvcMap["dev2pdb"] = int64(0.50 * messagingSvcCpus * 1e9)
	nanoCPUsSvcMap["timescaledb"] = int64(iotStorageDataSvcCpus * 1e9)

	nanoCPUsSvcMap["postgres"] = int64(adminDataStorageSvcCpus * 1e9)
	nanoCPUsSvcMap["s3_storage"] = int64(0.5 * adminDataStorageSvcCpus * 1e9)
	nanoCPUsSvcMap["minio"] = int64(adminDataStorageSvcCpus * 1e9)

	if uiSvcCpus <= 1.0 {
		nanoCPUsSvcMap["admin_api"] = int64(uiSvcCpus * 1e9)
	} else {
		nanoCPUsSvcMap["admin_api"] = int64(1.0 * 1e9)
	}
	nanoCPUsSvcMap["admin_api"] = int64(uiSvcCpus * 1e9)
	nanoCPUsSvcMap["frontend"] = int64(uiSvcCpus * 1e9)
	nanoCPUsSvcMap["pgadmin4"] = int64(0.5 * uiSvcCpus * 1e9)
	nanoCPUsSvcMap["grafana_renderer"] = int64(0.5 * uiSvcCpus * 1e9)
	nanoCPUsSvcMap["pipelines"] = int64(pipelinesSvcCpus * 1e9)

	if uiSvcCpus <= 1.0 {
		nanoCPUsSvcMap["nri"] = int64(uiSvcCpus * 1e9)
	} else {
		nanoCPUsSvcMap["nri"] = int64(1.0 * 1e9)
	}

	return nanoCPUsSvcMap
}
