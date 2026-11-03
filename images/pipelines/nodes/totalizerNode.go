package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// TotalizerNode turns counters, rates and events into amounts per day and
// totals since the start (totalizerLogic.go). Output 0: the summary of each
// day (and every N minutes if set).
type TotalizerNode struct {
	BaseNode
	cfg   *totalizerConfig
	state *signalState
}

func CreateTotalizerNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*TotalizerNode, error) {
	loc, err := nodeLocation(node.Settings, fm, p)
	if err == nil {
		var cfg *totalizerConfig
		if cfg, err = parseTotalizerConfig(node.Settings, loc); err == nil {
			n := &TotalizerNode{BaseNode: newSignalBase(node, fm, p, "Totalizer"), cfg: cfg}
			n.state = newSignalState(&n.BaseNode)
			return n, nil
		}
	}
	fm.Log().Errorf("TotalizerNode %s: %v", node.NodeUid, err)
	return nil, fmt.Errorf("totalizer node: %w", err)
}

func (n *TotalizerNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	n.runLeaderClock(5*time.Second, func(now time.Time) { n.tick(now, log) })
}

func (n *TotalizerNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	arrival := time.Now()
	at := eventTime(topic, payload, n.cfg.TimePath, arrival)
	var out totalizerOutcome
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *totalizerState) (*totalizerState, error) {
		out = n.cfg.observe(current, key, topic, payload, at, arrival)
		return out.Next, nil
	})
	if err != nil {
		return fmt.Errorf("totalizer state: %w", err)
	}
	for _, s := range out.Summaries {
		n.sendToOutput(emitMessage(msg, topic, s), 0, log)
	}
	return nil
}

func (n *TotalizerNode) tick(now time.Time, log *logger.Logger) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		log.Warnf("TotalizerNode %s: listing its signals: %v", n.NodeUid, err)
		return
	}
	for _, kvKey := range keys {
		key := n.state.partition(kvKey)
		var out totalizerOutcome
		err := modifyState(n.Ctx, n.state, kvKey, func(current *totalizerState) (*totalizerState, error) {
			out = n.cfg.tick(current, key, now)
			if out.Next == nil {
				return current, nil
			}
			return out.Next, nil
		})
		if err != nil {
			log.Warnf("TotalizerNode %s: %v", n.NodeUid, err)
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
