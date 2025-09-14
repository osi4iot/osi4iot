package common

import "pipelines/logger"

type NodeStatus int

const (
	NodeStatusCreated NodeStatus = iota
	NodeStatusUpdated
	NodeStatusRunning
	NodeStatusStopped
	NodeStatusError
)

func (s NodeStatus) String() string {
	switch s {
	case NodeStatusCreated:
		return "created"
	case NodeStatusRunning:
		return "running"
	case NodeStatusStopped:
		return "stopped"
	case NodeStatusUpdated:
		return "updated"
	case NodeStatusError:
		return "error"
	default:
		return "unknown"
	}
}

type Node interface {
	Start(log *logger.Logger, needReinitialization bool)
	Stop(log *logger.Logger)
	GetUid() string
	GetOrgId() int
	GetOrgHash() string
	GetGroupId() int
	GetAssetId() int
	GetName() string
	GetType() string
	GetXpos() float64
	GetYpos() float64
	GetNumOutputs() int
	GetSettings() map[string]any
	GetDigitalTwinId() int
	GetDigitalTwinUid() string
	GetStatus() NodeStatus
	ResetNodeContext()
	GetDebug() string
	HandleError(err error)
	HandleDebug(msg Message, outputIndex int)
	HandleInfo(msg string)
	GetNodeInputWires() []*Wire
	GetNodeOutputWires() [][]*Wire
}