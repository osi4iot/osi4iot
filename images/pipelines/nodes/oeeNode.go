package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// OeeNode computes the OEE of a machine per day or shift from its states
// and pieces (oeeLogic.go). Output 0: the summary of each period (and every
// N minutes if set).
type OeeNode struct {
	BaseNode
	cfg   *oeeConfig
	state *signalState
}

func CreateOEENode(node common.NodeData, fm common.Manager, p common.Pipeline) (*OeeNode, error) {
	loc, err := nodeLocation(node.Settings, fm, p)
	if err == nil {
		var cfg *oeeConfig
		if cfg, err = parseOeeConfig(node.Settings, loc); err == nil {
			n := &OeeNode{BaseNode: newSignalBase(node, fm, p, "OEE"), cfg: cfg}
			n.state = newSignalState(&n.BaseNode)
			return n, nil
		}
	}
	fm.Log().Errorf("OeeNode %s: %v", node.NodeUid, err)
	return nil, fmt.Errorf("oee node: %w", err)
}

func (n *OeeNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	n.runLeaderClock(2*time.Second, func(now time.Time) { n.tick(now, log) })
}

func (n *OeeNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	arrival := time.Now()
	at := eventTime(topic, payload, n.cfg.TimePath, arrival)
	var out oeeOutcome
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *oeeState) (*oeeState, error) {
		out = n.cfg.observe(current, key, topic, payload, at, arrival)
		return out.Next, nil
	})
	if err != nil {
		return fmt.Errorf("oee state: %w", err)
	}
	for _, s := range out.Summaries {
		n.sendToOutput(emitMessage(msg, topic, s), 0, log)
	}
	return nil
}

func (n *OeeNode) tick(now time.Time, log *logger.Logger) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		log.Warnf("OeeNode %s: listing its machines: %v", n.NodeUid, err)
		return
	}
	for _, kvKey := range keys {
		key := n.state.partition(kvKey)
		var out oeeOutcome
		err := modifyState(n.Ctx, n.state, kvKey, func(current *oeeState) (*oeeState, error) {
			out = n.cfg.tick(current, key, now)
			if out.Next == nil {
				return current, nil
			}
			return out.Next, nil
		})
		if err != nil {
			log.Warnf("OeeNode %s: %v", n.NodeUid, err)
			continue
		}
		topic := key
		if out.Next != nil && out.Next.Topic != "" {
			topic = out.Next.Topic
		}
		for _, s := range out.Summaries {
			n.sendToOutput(emitMessage(nil, topic, s), 0, log)
		}
	}
}
