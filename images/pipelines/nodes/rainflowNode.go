package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// RainflowNode counts the stress cycles of a signal and their fatigue
// damage (rainflowLogic.go). Output 0: the summary of each day (and every
// N minutes if set), with the totals since the start.
type RainflowNode struct {
	BaseNode
	cfg   *rainflowConfig
	state *signalState
	warn  onceWarner
}

func CreateRainflowNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*RainflowNode, error) {
	loc, err := nodeLocation(node.Settings, fm, p)
	if err == nil {
		var cfg *rainflowConfig
		if cfg, err = parseRainflowConfig(node.Settings, loc); err == nil {
			n := &RainflowNode{BaseNode: newSignalBase(node, fm, p, "Rainflow"), cfg: cfg}
			n.state = newSignalState(&n.BaseNode)
			return n, nil
		}
	}
	fm.Log().Errorf("RainflowNode %s: %v", node.NodeUid, err)
	return nil, fmt.Errorf("rainflow node: %w", err)
}

func (n *RainflowNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	n.runLeaderClock(5*time.Second, func(now time.Time) { n.tick(now, log) })
}

func (n *RainflowNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	samples := n.cfg.samples(topic, payload)
	if len(samples) == 0 {
		n.warn.warn(&n.BaseNode, "Message without numbers in "+n.cfg.Field)
		return nil
	}
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	arrival := time.Now()
	at := n.cfg.messageTime(topic, payload, arrival)
	var out rainflowOutcome
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *rainflowState) (*rainflowState, error) {
		out = n.cfg.observe(current, key, topic, samples, at, arrival)
		return out.Next, nil
	})
	if err != nil {
		return fmt.Errorf("rainflow state: %w", err)
	}
	if out.Next != nil && out.Next.Counter.Dropped > 0 {
		n.warn.warn(&n.BaseNode, "The rainflow residue reached its cap: the oldest reversals were dropped")
	}
	for _, s := range out.Summaries {
		n.sendToOutputs(emitMessage(msg, topic, s), log)
	}
	return nil
}

func (n *RainflowNode) tick(now time.Time, log *logger.Logger) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		log.Warnf("RainflowNode %s: listing its signals: %v", n.NodeUid, err)
		return
	}
	for _, kvKey := range keys {
		key := n.state.partition(kvKey)
		var out rainflowOutcome
		err := modifyState(n.Ctx, n.state, kvKey, func(current *rainflowState) (*rainflowState, error) {
			out = n.cfg.tick(current, key, now)
			if out.Next == nil {
				return current, nil
			}
			return out.Next, nil
		})
		if err != nil {
			log.Warnf("RainflowNode %s: %v", n.NodeUid, err)
			continue
		}
		topic := key
		if out.Next != nil && out.Next.Topic != "" {
			topic = out.Next.Topic
		}
		for _, s := range out.Summaries {
			n.sendToOutputs(emitMessage(nil, topic, s), log)
		}
	}
}
