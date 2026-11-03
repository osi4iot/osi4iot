package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// WindowNode computes statistics of numeric fields over windows of
// messages or of time (windowLogic.go). Time tumbling windows are also
// closed by the leader's clock when no later message closes them.
type WindowNode struct {
	BaseNode
	cfg   *windowConfig
	state *signalState
	warn  onceWarner
}

func CreateWindowNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*WindowNode, error) {
	cfg, err := parseWindowConfig(node.Settings)
	if err != nil {
		fm.Log().Errorf("WindowNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("window node: %w", err)
	}
	n := &WindowNode{BaseNode: newSignalBase(node, fm, p, "Window"), cfg: cfg}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *WindowNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	if n.cfg.Type == "time" && n.cfg.Mode == "tumbling" {
		n.runLeaderClock(time.Second, func(now time.Time) { n.closeDueWindows(now, log) })
	}
}

func (n *WindowNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	at := messageTime(topic, payload, n.cfg.TimePath, time.Now())
	partition := partitionKey(topic, payload, n.cfg.KeyPath)

	var outcome windowOutcome
	err := modifyState(n.Ctx, n.state, n.state.key(partition), func(current *windowState) (*windowState, error) {
		outcome = n.cfg.add(current, topic, payload, at)
		return outcome.Next, nil
	})
	if err != nil {
		return fmt.Errorf("window state: %w", err)
	}
	if outcome.Ignored != "" {
		n.warn.warn(&n.BaseNode, "Message not used: "+outcome.Ignored)
	}
	if outcome.Emit != nil {
		n.emit(msg, topic, partition, outcome.Emit, log)
	}
	return nil
}

// closeDueWindows closes the time windows whose end passed without a
// later message.
func (n *WindowNode) closeDueWindows(now time.Time, log *logger.Logger) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		log.Warnf("WindowNode %s: listing its windows: %v", n.NodeUid, err)
		return
	}
	for _, kvKey := range keys {
		var outcome windowOutcome
		err := modifyState(n.Ctx, n.state, kvKey, func(current *windowState) (*windowState, error) {
			outcome = n.cfg.closeDue(current, now)
			return outcome.Next, nil
		})
		if err != nil {
			log.Warnf("WindowNode %s: closing a window: %v", n.NodeUid, err)
			continue
		}
		if outcome.Emit != nil {
			topic := ""
			if outcome.Next != nil {
				topic = outcome.Next.Topic
			}
			n.emit(nil, topic, n.state.partition(kvKey), outcome.Emit, log)
		}
	}
}

func (n *WindowNode) emit(from common.Message, topic, partition string, payload map[string]any, log *logger.Logger) {
	if truncated, _ := payload["truncated"].(bool); truncated {
		n.warn.warn(&n.BaseNode, fmt.Sprintf("Window of %q has more than %d samples: only the latest are used", partition, n.cfg.MaxSamples))
	}
	if n.cfg.KeyPath != "" {
		payload["key"] = partition
	}
	n.sendToOutputs(emitMessage(from, topic, payload), log)
}
