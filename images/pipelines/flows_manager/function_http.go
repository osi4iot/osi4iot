package flows_manager

import (
	"net/http"
	"time"

	"pipelines/config"
	"pipelines/logger"
	"pipelines/safehttp"
)

// functionHttpTimeout bounds a whole request of a Function node's script.
const functionHttpTimeout = 15 * time.Second

// initFunctionHttp builds the HTTP client of the Function nodes' scripts:
// the internet only, unless config.yaml (functionHttp) allows internal
// addresses. A wrong entry in allowedHosts is logged and the client is
// built without the exceptions, never without the protection.
func (fm *FlowsManager) initFunctionHttp(cfg config.FunctionHttpConfig, log *logger.Logger) {
	policy := safehttp.Policy{
		AllowPrivateNetworks: cfg.AllowPrivateNetworks,
		AllowedHosts:         cfg.AllowedHosts,
	}
	client, err := safehttp.NewClient(policy, functionHttpTimeout)
	if err != nil {
		log.Errorf("functionHttp configuration: %v; Function nodes can only reach the internet", err)
		client, _ = safehttp.NewClient(safehttp.Policy{}, functionHttpTimeout)
	}
	if cfg.AllowPrivateNetworks {
		log.Warnf("functionHttp.allowPrivateNetworks is on: Function nodes can reach the platform's internal services")
	}
	fm.functionHttp = client
}

func (fm *FlowsManager) GetFunctionHttpClient() *http.Client {
	if fm.functionHttp == nil {
		client, _ := safehttp.NewClient(safehttp.Policy{}, functionHttpTimeout)
		fm.functionHttp = client
	}
	return fm.functionHttp
}
