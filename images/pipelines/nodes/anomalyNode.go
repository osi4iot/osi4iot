package nodes

import (
	"context"
	"fmt"

	"pipelines/common"
	"pipelines/dsp"
	"pipelines/logger"
)

// AnomalyNode judges one field of every message (anomalyLogic.go). Output 0:
// every message, with the verdict in payload.<resultField>; output 1
// (optional, anomaliesOutput): only the anomalous ones.
type AnomalyNode struct {
	BaseNode
	cfg   *anomalyConfig
	state *signalState
	warn  onceWarner
}

func CreateAnomalyNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*AnomalyNode, error) {
	cfg, err := parseAnomalyConfig(node.Settings)
	if err != nil {
		fm.Log().Errorf("AnomalyNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("anomaly node: %w", err)
	}
	n := &AnomalyNode{BaseNode: newSignalBase(node, fm, p, "Anomaly"), cfg: cfg}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *AnomalyNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	n.startSignalNode(ctx, log, n.processMessage)
}

func (n *AnomalyNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	var verdict map[string]any
	used := true
	isAnomaly := false
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *dsp.AnomalyState) (*dsp.AnomalyState, error) {
		r, x, next, ok := n.cfg.judge(current, topic, payload)
		used = ok
		if !ok {
			return current, nil
		}
		verdict = n.cfg.verdict(r, key, x)
		isAnomaly = r.IsAnomaly
		return next, nil
	})
	if err != nil {
		return fmt.Errorf("anomaly state: %w", err)
	}
	if !used {
		n.warn.warn(&n.BaseNode, "Message without a number in "+n.cfg.Field)
		return nil
	}
	out := msg.Clone()
	out.GetPayload()[n.cfg.ResultField] = verdict
	n.sendToOutput(out, 0, log)
	if isAnomaly {
		n.sendToOutput(out.Clone(), 1, log)
	}
	return nil
}