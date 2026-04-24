package function_library

import (
	"fmt"
	"pipelines/common"
	"pipelines/message"
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
	jsonData, err := utils.MarshalData(rawMsg)
	if err != nil {
		return
	}

	var msg message.Message
	if err := utils.UnmarshalData(jsonData, &msg); err != nil {
		return
	}

	l.node.HandleDebug(&msg, 0)
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