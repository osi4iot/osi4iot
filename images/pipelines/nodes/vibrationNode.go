package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// VibrationNode computes the vibration features of blocks of samples
// (vibrationLogic.go): one output message per block, or per window of a
// stream of single values.
type VibrationNode struct {
	BaseNode
	cfg   *vibrationConfig
	state *signalState
	warn  onceWarner
}

func CreateVibrationNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*VibrationNode, error) {
	cfg, err := parseVibrationConfig(node.Settings)
	if err != nil {
		fm.Log().Errorf("VibrationNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("vibration node: %w", err)
	}
	n := &VibrationNode{BaseNode: newSignalBase(node, fm, p, "Vibration"), cfg: cfg}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *VibrationNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	n.startSignalNode(ctx, log, n.processMessage)
}

func (n *VibrationNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	raw, ok := lookupPath(topic, payload, n.cfg.Field)
	if !ok {
		n.warn.warn(&n.BaseNode, "Message without "+n.cfg.Field)
		return nil
	}
	samples := numbersOf(raw, 1)
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	at := isoTime(time.Now())

	if n.cfg.Mode == "block" {
		fs, err := n.cfg.blockFs(topic, payload)
		if err != nil {
			return err
		}
		out, err := n.cfg.features(samples, fs)
		if err != nil {
			return fmt.Errorf("vibration features: %w", err)
		}
		n.emit(msg, topic, key, at, out, log)
		return nil
	}

	var windows [][]float64
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *vibrationState) (*vibrationState, error) {
		var next *vibrationState
		windows, next = n.cfg.stream(current, topic, samples)
		return next, nil
	})
	if err != nil {
		return fmt.Errorf("vibration buffer: %w", err)
	}
	for _, w := range windows {
		out, err := n.cfg.features(w, n.cfg.Fs)
		if err != nil {
			return fmt.Errorf("vibration features: %w", err)
		}
		n.emit(msg, topic, key, at, out, log)
	}
	return nil
}

func (n *VibrationNode) emit(from common.Message, topic, key, at string, payload map[string]any, log *logger.Logger) {
	payload["at"] = at
	if key != "" {
		payload["key"] = key
	}
	n.sendToOutputs(emitMessage(from, topic, payload), log)
}
