package common

import "pipelines/logger"

type JSFunction struct {
	Name string
	Func interface{}
}

// JSGlobalProvider interface for providing JavaScript global functions
type JSGlobalProvider interface {
	GetJSFunctions(node Node, fm Manager, log *logger.Logger) []JSFunction
}