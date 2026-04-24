package nodes

import (
	"context"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"time"
)

type DelayNode struct {
	BaseNode
	Duration time.Duration
}

func CreateDelayNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*DelayNode, error) {
	durationFloat, ok := node.Settings["duration"].(float64)
	if !ok || durationFloat < 0 {
		fm.Log().Errorf("DelayNode %s: 'duration' setting is required and must be a positive number", node.NodeUid)
		return nil, fmt.Errorf("duration setting is required and must be a positive number")
	}
	duration := time.Duration(durationFloat * float64(time.Second))

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &DelayNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Delay",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		Duration: duration,
	}, nil
}

func (n *DelayNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("DelayNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting DelayNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *DelayNode) processMessage(message common.Message, log *logger.Logger) error {
	go func(msg common.Message, mylog *logger.Logger) {
		timer := time.NewTimer(n.Duration)
		defer timer.Stop()

		select {
		case <-n.Ctx.Done():
			mylog.Infof("DelayNode %s context cancelled during delay", n.NodeUid)
			return
		case <-timer.C:
			if n.GetStatus() != common.NodeStatusRunning {
				mylog.Infof("DelayNode %s stopped during delay, discarding message", n.NodeUid)
				return
			}
			n.sendToOutputs(msg, mylog)
			return
		}
	}(message, log)

	return nil
}
