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

func (h *Http) GetWithJwt(url string, token string) interface{} {
	response, err := utils.HttpGetWithJwt(url, token)
	if err != nil {
		h.log.Errorf("Failed to get HTTP response with JWT: %v", err)
		return nil
	}

	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal HTTP response with JWT: %v", err)
	}
	return responseData
}

func (h *Http) Post(url string, body interface{}) interface{} {
	response, err := utils.HttpPost(url, body)
	if err != nil {
		h.log.Errorf("Failed to post HTTP request: %v", err)
		return nil
	}

	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal HTTP post response: %v", err)
	}
	return responseData
}

func (h *Http) PostWithJwt(url string, body interface{}, token string) interface{} {
	response, err := utils.HttpPostWithJwt(url, body, token)
	if err != nil {
		h.log.Errorf("Failed to post HTTP request with JWT: %v", err)
		return nil
	}

	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal HTTP post response with JWT: %v", err)
	}
	return responseData
}

func (h *Http) Patch(url string, body interface{}) interface{} {
	response, err := utils.HttpPatch(url, body)
	if err != nil {
		h.log.Errorf("Failed to patch HTTP request: %v", err)
		return nil
	}

	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal HTTP patch response: %v", err)
	}
	return responseData
}

func (h *Http) PatchWithJwt(url string, body interface{}, token string) interface{} {
	response, err := utils.HttpPatchWithJwt(url, body, token)
	if err != nil {
		h.log.Errorf("Failed to patch HTTP request with JWT: %v", err)
		return nil
	}

	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal HTTP patch response with JWT: %v", err)
	}
	return responseData
}

func (h *Http) Delete(url string) interface{} {
	response, err := utils.HttpDelete(url)
	if err != nil {
		h.log.Errorf("Failed to delete HTTP request: %v", err)
		return nil
	}

	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal HTTP delete response: %v", err)
	}
	return responseData
}

func (h *Http) DeleteWithJwt(url string, token string) interface{} {
	response, err := utils.HttpDeleteWithJwt(url, token)
	if err != nil {
		h.log.Errorf("Failed to delete HTTP request with JWT: %v", err)
		return nil
	}

	var responseData interface{}
	if err := utils.UnmarshalData(response, &responseData); err != nil {
		h.log.Errorf("Failed to unmarshal HTTP delete response with JWT: %v", err)
	}
	return responseData
}
