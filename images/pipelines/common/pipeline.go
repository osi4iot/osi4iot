package common

import "context"

type PipelineStatus int

const (
	PipelineStatusUnknown PipelineStatus = iota
	PipelineStatusCreated
	PipelineStatusRunning
	PipelineStatusStopped
	PipelineStatusError
	PipelineStatusDeleted
)

func (s PipelineStatus) String() string {
	switch s {
	case PipelineStatusUnknown:
		return "unknown"
	case PipelineStatusCreated:
		return "created"
	case PipelineStatusRunning:
		return "running"
	case PipelineStatusStopped:
		return "stopped"
	case PipelineStatusError:
		return "error"
	case PipelineStatusDeleted:
		return "deleted"
	default:
		return "unknown"
	}
}

type LeaderElector interface {
	IsLeader() bool
}

type Pipeline interface {
	Start(ctx context.Context, needReinitialization bool)
	StartStatusPublisher(ctx context.Context)
	Stop(ctx context.Context, action string) error
	StopStatusPublisher()
	SetStatus(ctx context.Context, status PipelineStatus)
	GetStatus() PipelineStatus
	ResetNode(ctx context.Context, nodeUid string) error
	RestartNode(ctx context.Context, nodeUid string) error
	GetNodeData(nodeUid string) *NodeData
	GetNode(nodeUid string) Node
	AddWire(wire *Wire)
	DeleteWire(wireUid string) error
	GetPipelineWires() []*Wire
	GetNodeOutputWires(nodeUid string) [][]*Wire
	GetNodeInputWires(nodeUid string) []*Wire
	GetNodeOutputIndex(nodeUid string, outputIndex int) []*Wire
	GetDigitalTwinId() int
	GetDigitalTwinUid() string
	GetDigitalTwinDescription() string
	GetAssetId() int
	GetOrgId() int
	GetOrgHash() string
	GetGroupId() int
	PublishPipelineStatus(payload PipelineStatusMessage)
	GetLeaderElector() LeaderElector
	GetReplicaIndexLeader(ctx context.Context) int
	PublishChatMessages(ctx context.Context, userName string)
	ClearChatMessagesHistory(ctx context.Context, userName string)
	CreateTelegramListenNodes(ctx context.Context, org *Org) error
	HasTelegramListenNodesData() bool
	HasTelegramListenNodes() bool
}

type PipelineStatusMessage struct {
	PipelineStatus     string `json:"pipelineStatus"`
	ReplicaIndexLeader int    `json:"replicaIndexLeader,omitempty"`
}
