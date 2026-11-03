package nodes

import (
	"context"
	"fmt"

	"pipelines/common"
	"pipelines/logger"
)

// SwitchNode sends each message to the outputs whose rule holds for one of
// its fields (switchLogic.go).
type SwitchNode struct {
	BaseNode
	cfg *switchConfig
}

func CreateSwitchNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*SwitchNode, error) {
	cfg, err := parseSwitchConfig(node.Settings)
	if err != nil {
		fm.Log().Errorf("SwitchNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("switch node: %w", err)
	}
	if node.NumOutputs != cfg.numOutputs() {
		fm.Log().Warnf("SwitchNode %s: %d outputs for %d rules (otherwise: %v)", node.NodeUid, node.NumOutputs, len(cfg.Rules), cfg.Otherwise)
	}
	return &SwitchNode{BaseNode: newSignalBase(node, fm, p, "Switch"), cfg: cfg}, nil
}

func (n *SwitchNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	n.startSignalNode(ctx, log, n.processMessage)
}

func (n *SwitchNode) processMessage(msg common.Message, log *logger.Logger) error {
	value, exists := lookupPath(msg.GetTopic(), msg.GetPayload(), n.cfg.Property)
	outputs := n.cfg.outputs(value, exists)
	for i, output := range outputs {
		out := msg
		if i > 0 {
			out = msg.Clone()
		}
		n.sendToOutput(out, output, log)
	}
	return nil
}
