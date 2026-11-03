package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// JoinNode keeps the latest value of several sources and sends them
// together (joinLogic.go). In "set" mode with a timeout, the leader's
// clock sends the incomplete sets.
type JoinNode struct {
	BaseNode
	cfg   *joinConfig
	state *signalState
	warn  onceWarner
}

func CreateJoinNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*JoinNode, error) {
	cfg, err := parseJoinConfig(node.Settings, topicResolverFor(fm, p))
	if err != nil {
		fm.Log().Errorf("JoinNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("join node: %w", err)
	}
	n := &JoinNode{BaseNode: newSignalBase(node, fm, p, "Join"), cfg: cfg}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *JoinNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	if n.cfg.Mode == "set" && n.cfg.Timeout > 0 {
		n.runLeaderClock(time.Second, func(now time.Time) { n.closeDueSet(now, log) })
	}
}

// stateKey: the node has a single state (the key path identifies the
// sources, not partitions).
func (n *JoinNode) stateKey() string {
	return n.state.key("")
}

func (n *JoinNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	at := messageTime(topic, payload, n.cfg.TimePath, time.Now())

	var outcome joinOutcome
	err := modifyState(n.Ctx, n.state, n.stateKey(), func(current *joinState) (*joinState, error) {
		outcome = n.cfg.add(current, topic, payload, at)
		return outcome.Next, nil
	})
	if err != nil {
		return fmt.Errorf("join state: %w", err)
	}
	if outcome.Ignored != "" {
		n.warn.warn(&n.BaseNode, "Message not used: "+outcome.Ignored)
	}
	if outcome.Emit != nil {
		n.sendToOutputs(emitMessage(msg, topic, outcome.Emit), log)
	}
	return nil
}

func (n *JoinNode) closeDueSet(now time.Time, log *logger.Logger) {
	var outcome joinOutcome
	var topic string
	err := modifyState(n.Ctx, n.state, n.stateKey(), func(current *joinState) (*joinState, error) {
		outcome = n.cfg.closeDue(current, now)
		if current != nil {
			topic = current.Topic
		}
		return outcome.Next, nil
	})
	if err != nil {
		log.Warnf("JoinNode %s: closing a set: %v", n.NodeUid, err)
		return
	}
	if outcome.Emit != nil {
		n.sendToOutputs(emitMessage(nil, topic, outcome.Emit), log)
	}
}
