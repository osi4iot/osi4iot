package nodes

import (
	"context"
	"fmt"
	"time"

	"pipelines/common"
	"pipelines/logger"
)

// PoseEstimationNode estimates the pose of a camera with respect to a known
// object from named 2D keypoints (poseLogic.go). Output 0: the frames with a
// pose, with the result in payload.<resultField> and, for the 3D viewer,
// payload.camera and payload.customAnimation; output 1: the frames without a
// pose, with the reason.
type PoseEstimationNode struct {
	BaseNode
	cfg   *poseConfig
	state *signalState
	warn  onceWarner
}

func CreatePoseEstimationNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*PoseEstimationNode, error) {
	cfg, err := parsePoseConfig(node.Settings)
	if err != nil {
		fm.Log().Errorf("PoseEstimationNode %s: %v", node.NodeUid, err)
		return nil, fmt.Errorf("pose estimation node: %w", err)
	}
	n := &PoseEstimationNode{BaseNode: newSignalBase(node, fm, p, "PoseEstimation"), cfg: cfg}
	n.state = newSignalState(&n.BaseNode)
	return n, nil
}

func (n *PoseEstimationNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	for _, w := range n.cfg.Warnings {
		n.HandleWarn(w)
	}
	n.startSignalNode(ctx, log, n.processMessage)
}

func (n *PoseEstimationNode) processMessage(msg common.Message, log *logger.Logger) error {
	if n.state.handleReset(msg, log) {
		return nil
	}
	topic, payload := msg.GetTopic(), msg.GetPayload()
	key := partitionKey(topic, payload, n.cfg.KeyPath)
	var frame poseFrame
	err := modifyState(n.Ctx, n.state, n.state.key(key), func(current *poseState) (*poseState, error) {
		// also without a pose: a pose left out for being far from the track is remembered (Pending)
		next, f := n.cfg.step(current, topic, payload, time.Now())
		frame = f
		return next, nil
	})
	if err != nil {
		return fmt.Errorf("pose state: %w", err)
	}
	out := msg.Clone()
	outPayload := out.GetPayload()
	if !frame.ok {
		r := map[string]any{"ok": false, "reason": frame.reason}
		if key != "" {
			r["key"] = key
		}
		outPayload[n.cfg.ResultField] = r
		n.sendToOutput(out, 1, log)
		return nil
	}
	if key != "" {
		frame.result["key"] = key
	}
	outPayload[n.cfg.ResultField] = frame.result
	if frame.camera != nil {
		outPayload["camera"] = frame.camera
	}
	if len(frame.animated) > 0 {
		anim, _ := outPayload["customAnimation"].(map[string]any)
		if anim == nil {
			anim = map[string]any{}
		}
		for k, v := range frame.animated {
			anim[k] = v
		}
		outPayload["customAnimation"] = anim
	}
	if w, ok := frame.result["warnings"].([]string); ok {
		for _, text := range w {
			n.warn.warn(&n.BaseNode, text)
		}
	}
	n.sendToOutput(out, 0, log)
	return nil
}
