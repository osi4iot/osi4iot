package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"

	"github.com/nats-io/nats.go"
)

type InjectNode struct {
	BaseNode
	SubjectIn string
}

func CreateInjectNode(node common.NodeData, fm common.Manager) (*InjectNode, error) {

	subjectIn, ok := node.Settings["subjectIn"].(string)
	if !ok || subjectIn == "" {
		fm.Log().Errorf("InjectNode %s: 'subjectIn' setting is required", node.NodeUid)
		return nil, fmt.Errorf("subjectIn setting is required")
	}

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	logTopic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &InjectNode{
		BaseNode: BaseNode{
			Id:             node.Id,
			NodeUid:        node.NodeUid,
			OrgId:          node.OrgId,
			OrgHash:        org.OrgHash,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			GroupId:        node.GroupId,
			AssetId:        node.AssetId,
			DigitalTwinId:  node.DigitalTwinId,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "Inject",
			LogSubject:     logSubject,
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		SubjectIn: subjectIn,
	}, nil
}

func (n *InjectNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("InjectNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting InjectNode with UID: %s", n.NodeUid)

	n.wg.Add(1)
	go n.handleNatsSubscription(log, n.SubjectIn, n.processNatsMessage)
}

func (n *InjectNode) processNatsMessage(msg *nats.Msg, log *logger.Logger) error {
	var message common.Message
	if err := json.Unmarshal(msg.Data, &message); err != nil {
		return fmt.Errorf("failed to unmarshal message for node %s: %w", n.NodeUid, err)
	}

	subject := message.Topic
	if subject != "" && subject != n.SubjectIn {
		return n.Fm.NatsPublish(subject, msg.Data)
	}
	return nil
}
