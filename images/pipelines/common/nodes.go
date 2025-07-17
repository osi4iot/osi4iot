package common

import "pipelines/logger"

type NodeStatus int

const (
	NodeStatusCreated NodeStatus = iota
	NodeStatusUpdated
	NodeStatusRunning
	NodeStatusStopped
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
	default:
		return "unknown"
	}
}

type Node interface {
	Start(log *logger.Logger, needReinitialization bool)
	Stop(log *logger.Logger)
	GetId() int
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
	GetDigitalTwinUID() string
	GetStatus() NodeStatus
	GetDebug() string
}