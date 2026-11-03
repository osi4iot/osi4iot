package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// DeadbandNode lets a message through only when its fields changed more
// than the band, or the maximum interval passed (deadbandLogic.go). Output
// 0: the messages that pass; output 1 (optional): the ones blocked.
type DeadbandNode struct {
	BaseNode
	cfg   *deadbandConfig
	state *signalState
}

func CreateDeadbandNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*DeadbandNode, error) {
	cfg, err := parseDeadbandConfig(node.Settings)
	if err != nil {
		fm.Log().Errorf("DeadbandNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("deadband node: %w", err)
	}
	n := &DeadbandNode{BaseNode: newSignalBase(node, fm, p, "Deadband"), cfg: cfg}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *DeadbandNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	n.startSignalNode(ctx, log, n.processMessage)
}

func (n *DeadbandNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	at := messageTime(topic, payload, n.cfg.TimePath, time.Now())
	partition := partitionKey(topic, payload, n.cfg.KeyPath)

	pass := false
	err := modifyState(n.Ctx, n.state, n.state.key(partition), func(current *deadbandState) (*deadbandState, error) {
		var next *deadbandState
		pass, next = n.cfg.decide(current, topic, payload, at)
		return next, nil
	})
	if err != nil {
		return fmt.Errorf("deadband state: %w", err)
	}
	if pass {
		n.sendToOutput(msg, 0, log)
	} else {
		n.sendToOutput(msg, 1, log)
	}
	return nil
}
