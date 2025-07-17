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
	Duration int // Delay in milliseconds
}

func CreateDelayNode(node common.NodeData, fm common.Manager) (*DelayNode, error) {
	durationFloat, ok := node.Settings["duration"].(float64)
	duration := int(durationFloat)
	if !ok || duration <= 0 {
		fm.Log().Errorf("DelayNode %s: 'duration' setting is required and must be a positive integer", node.NodeUid)
		return nil, fmt.Errorf("duration setting is required and must be a positive integer")
	}

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	logTopic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &DelayNode{
		BaseNode: BaseNode{
			Id:             node.Id,
			NodeUid:        node.NodeUid,
			OrgId:          node.OrgId,
			OrgHash:        org.OrgHash,
			GroupId:        node.GroupId,
			AssetId:        node.AssetId,
			DigitalTwinId:  node.DigitalTwinId,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "Delay",
			LogSubject:     logSubject,
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		Duration: duration,
	}, nil
}

func (n *DelayNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("DelayNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting DelayNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *DelayNode) processMessage(msg common.Message, log *logger.Logger) error {
	timer := time.NewTimer(time.Duration(n.Duration) * time.Millisecond)
	defer timer.Stop()

	select {
	case <-n.Ctx.Done():
		log.Infof("DelayNode %s context cancelled during delay", n.NodeUid)
		return nil
	case <-timer.C:
		if n.GetStatus() != common.NodeStatusRunning {
			log.Infof("DelayNode %s stopped during delay, discarding message", n.NodeUid)
			return nil
		}
		n.sendToOutputs(msg, log)
		return nil
	}
}
