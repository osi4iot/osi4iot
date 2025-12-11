package resources

import (
	"strconv"

	pt "github.com/osi4iot/osi4iot/utils/osi4iot_go_cli/internals/types"
)

func getMemoryBytes(pd *pt.PlatformData, service string) int64 {
	services := pd.PlatformInfo.ServicesData
	for _, svc := range services {
		if svc.ServiceName == service {
			memStr := svc.Memory
			memFloat, _ := strconv.ParseFloat(memStr[0:len(memStr)-2], 64)
			return int64(memFloat * 1024 * 1024)
		}
	}

	return int64(500 * 1024 * 1024)
}
