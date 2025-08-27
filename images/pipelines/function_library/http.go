package function_library

import (
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
)

type Http struct {
	node common.Node
	log  *logger.Logger
}

func NewHttp(node common.Node, log *logger.Logger) *Http {
	return &Http{
		node: node,
		log:  log,
	}
}

func (h *Http) Get(url string) interface{} {
	response, err := utils.HttpGet(url)
	if err != nil {
		h.log.Errorf("Failed to get HTTP response: %v", err)
		return nil
	}

	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal HTTP response: %v", err)
	}
	return responseData
}
