package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
)

// WatchdogNode says when a source stops sending and when it comes back
// (watchdogLogic.go). Output 0: lost; output 1: restored; output 2
// (optional): the messages, unchanged.
type WatchdogNode struct {
	BaseNode
	cfg          *watchdogConfig
	state        *signalState
	watchingFrom time.Time
}

// topicResolverFor resolves the digital twin's topic references.
func topicResolverFor(fm common.Manager, p common.Pipeline) topicResolver {
	return func(topicRef string) (string, error) {
		topic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), topicRef)
		if topic == nil {
			return "", fmt.Errorf("topic %q not found in the digital twin", topicRef)
		}
		return utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid), nil
	}
}

func CreateWatchdogNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*WatchdogNode, error) {
	cfg, err := parseWatchdogConfig(node.Settings, topicResolverFor(fm, p))
	if err != nil {
		fm.Log().Errorf("WatchdogNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("watchdog node: %w", err)
	}
	n := &WatchdogNode{BaseNode: newSignalBase(node, fm, p, "Watchdog"), cfg: cfg}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *WatchdogNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	n.watchingFrom = time.Now()
	if !n.startSignalNode(ctx, log, n.processMessage) {
		return
	}
	n.runLeaderClock(time.Second, func(now time.Time) { n.checkSources(now, log) })
}

func (n *WatchdogNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	key := partitionKey(msg.GetTopic(), msg.GetPayload(), n.cfg.KeyPath)
	var event map[string]any
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *watchdogState) (*watchdogState, error) {
		var next *watchdogState
		event, next = n.cfg.seen(current, key, time.Now())
		return next, nil
	})
	if err != nil {
		return fmt.Errorf("watchdog state: %w", err)
	}
	if event != nil {
		n.sendToOutput(emitMessage(nil, msg.GetTopic(), event), 1, log)
	}
	if n.cfg.PassThrough {
		n.sendToOutput(msg, 2, log)
	}
	return nil
}

func (n *WatchdogNode) checkSources(now time.Time, log *logger.Logger) {
	keys, err := n.state.keys(n.Ctx)
	if err != nil {
		log.Warnf("WatchdogNode %s: listing its sources: %v", n.NodeUid, err)
		return
	}
	known := map[string]bool{}
	for _, k := range keys {
		known[k] = true
	}
	// the expected sources are watched from the start, even if they never send
	for _, src := range n.cfg.Expected {
		kvKey := n.state.key(src.Key)
		if known[kvKey] {
			continue
		}
		start := n.watchingFrom
		_ = modifyState(n.Ctx, n.state, kvKey, func(current *watchdogState) (*watchdogState, error) {
			if current != nil {
				return current, nil
			}
			return &watchdogState{LastSeen: start.UnixMilli()}, nil
		})
		keys = append(keys, kvKey)
	}
	for _, kvKey := range keys {
		key := n.state.partition(kvKey)
		var event map[string]any
		err := modifyState(n.Ctx, n.state, kvKey, func(current *watchdogState) (*watchdogState, error) {
			var next *watchdogState
			event, next = n.cfg.check(current, key, now, n.watchingFrom)
			return next, nil
		})
		if err != nil {
			log.Warnf("WatchdogNode %s: checking %q: %v", n.NodeUid, key, err)
			continue
		}
		if event != nil {
			n.sendToOutput(emitMessage(nil, key, event), 0, log)
		}
	}
}
