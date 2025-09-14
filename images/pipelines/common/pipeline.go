package common

type PipelineStatus int

const (
	PipelineStatusUnknown PipelineStatus = iota
	PipelineStatusCreated
	PipelineStatusRunning
	PipelineStatusStopped
	PipelineStatusError
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
	default:
		return "unknown"
	}
}

type Pipeline interface {
	Start(needReinitialization bool)
	Stop(action string) error
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
	StatusSubcription()
	PublishPipelineStatus(string)
}
