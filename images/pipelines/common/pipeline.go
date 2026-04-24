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
	AddWire(wire *Wire)
	ClearChatMessagesHistory(ctx context.Context, userName string)
	CreateTelegramListenNodes(ctx context.Context, org *Org) error
	DeleteWire(wireUid string) error
	GetAssetId() int
	GetDigitalTwinDescription() string
	GetDigitalTwinId() int
	GetDigitalTwinUid() string
	GetGroupId() int
	GetLeaderElector() LeaderElector
	GetNode(nodeUid string) Node
	GetNodeData(nodeUid string) *NodeData
	GetNodeInputWires(nodeUid string) []*Wire
	GetNodeOutputIndex(nodeUid string, outputIndex int) []*Wire
	GetNodeOutputWires(nodeUid string) [][]*Wire
	GetOrgHash() string
	GetOrgId() int
	GetPipelineWires() []*Wire
	GetReplicaIndexLeader(ctx context.Context) int
	GetStatus() PipelineStatus
	HasTelegramListenNodes() bool
	HasTelegramListenNodesData() bool
	PublishChatMessages(ctx context.Context, userName string)
	PublishPipelineStatus(payload PipelineStatusMessage)
	ResetNode(ctx context.Context, nodeUid string) error
	RestartNode(ctx context.Context, nodeUid string) error
	SetStatus(ctx context.Context, status PipelineStatus)
	Start(ctx context.Context, needReinitialization bool)
	StartStatusPublisher(ctx context.Context)
	Stop(ctx context.Context, action string) error
	StopStatusPublisher()
}

type PipelineStatusMessage struct {
	PipelineStatus     string `json:"pipelineStatus"`
	ReplicaIndexLeader int    `json:"replicaIndexLeader,omitempty"`
}
