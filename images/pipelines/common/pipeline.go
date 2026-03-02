package common

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
	Start(needReinitialization bool)
	StartStatusPublisher()
	Stop(action string) error
	StopStatusPublisher()
	SetStatus(status PipelineStatus)
	GetStatus() PipelineStatus
	AddNodeData(nodeData *NodeData) error
	ResetNode(nodeUid string) error
	RestartNode(nodeUid string) error
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
	GetReplicaIndexLeader() int
	PublishChatMessages(userName string)
	ClearChatMessagesHistory(userName string)
	CreateTelegramListenNodes(org *Org) error
	HasTelegramListenNodesData() bool
	HasTelegramListenNodes() bool
}

type PipelineStatusMessage struct {
	PipelineStatus     string `json:"pipelineStatus"`
	ReplicaIndexLeader int    `json:"replicaIndexLeader,omitempty"`
}
