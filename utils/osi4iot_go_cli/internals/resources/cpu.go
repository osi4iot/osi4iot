package resources

import (
	"strconv"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func getNanoCPU(pd *pt.PlatformData, service string) int64 {
	services := pd.PlatformInfo.ServicesData
	for _, svc := range services {
		if svc.ServiceName == service {
			cpuStr := svc.Cpu
			cpuFloat, _ := strconv.ParseFloat(cpuStr[0:len(cpuStr)-3], 64)
			return int64(cpuFloat * 1e9)
		}
	}

	return int64(0.25 * 1e9)
}