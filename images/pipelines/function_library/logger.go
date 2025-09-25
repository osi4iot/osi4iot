package function_library

import (
	"fmt"
	"pipelines/common"
	"pipelines/utils"
)

type NodeLogger struct {
	node common.Node
}

func newLogger(node common.Node) *NodeLogger {
	return &NodeLogger{
		node: node,
	}
}

func (l *NodeLogger) Msg(rawMsg any) {
	var message common.Message
	jsonData, err := utils.MarshalData(rawMsg)
	if err != nil {
		return
	}
	err = utils.UnmarshalData(jsonData, &message)
	if err != nil {
		return
	}

	l.node.HandleDebug(message, 0)
}

func (l *NodeLogger) Infof(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	l.node.HandleInfo(msg)
}

func (l *NodeLogger) Errorf(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	msgErr := fmt.Errorf("%s", msg)
	l.node.HandleError(msgErr)
}