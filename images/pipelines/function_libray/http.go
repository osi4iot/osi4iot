package function_libray

import (
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
)

type HTTPJSProvider struct{}

func (p *HTTPJSProvider) GetJSFunctions(node common.Node, fm common.Manager, log *logger.Logger) []common.JSFunction {
	return []common.JSFunction{
		{
			Name: "httpGet",
			Func: func(url string) interface{} {
				response, err := utils.HttpGet(url)
				if err != nil {
					log.Errorf("Failed to get HTTP response: %v", err)
					return nil
				}

				var responseData interface{}
				if err := utils.UnmarshalData(response, &responseData); err != nil {
					log.Errorf("Failed to unmarshal HTTP response: %v", err)
				}
				return responseData
			},
		},
	}
}