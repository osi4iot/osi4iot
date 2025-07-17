package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"slices"
	"strings"

	"github.com/nats-io/nats.go"
)

type ListenNode struct {
	BaseNode
	ListenTo string
	Topic    string
}

var posibleListenToForListenNode = []string{
	"Generic nats",
	"Generic mqtt",
	"Topic reference",
}

func CreateListenNode(node common.NodeData, fm common.Manager) (*ListenNode, error) {
	listenTo, ok := node.Settings["listenTo"].(string)
	if !ok || listenTo == "" {
		fm.Log().Errorf("ListenNode %s: 'listenTo' setting is required", node.NodeUid)
		return nil, fmt.Errorf("listenTo setting is required")
	}

	// Validate listenTo
	if !slices.Contains(posibleListenToForListenNode, listenTo) {
		fm.Log().Errorf("ListenNode %s: invalid 'listenTo' setting", node.NodeUid)
		return nil, fmt.Errorf("invalid 'listenTo' setting: %s", listenTo)
	}

	topic, ok := node.Settings["topic"].(string)
	if !ok || topic == "" {
		fm.Log().Errorf("ListenNode %s: 'topic' setting is required", node.NodeUid)
		return nil, fmt.Errorf("topic setting is required")
	}

	switch listenTo {
	case "Generic nats":
		// No specific processing needed for Generic nats
	case "Generic mqtt":
		topic = strings.ReplaceAll(topic, "/", ".")
	case "Topic reference":
		topicRef := topic
		topicInstance := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, topicRef)
		if topicInstance == nil {
			fm.Log().Errorf("ListenNode %s: topic reference '%s' not found", node.NodeUid, topicRef)
			return nil, fmt.Errorf("topic reference '%s' not found", topicRef)
		}
		topic = utils.TopicToNatsSubject(topicInstance.TopicType, topicInstance.GroupUid, topicInstance.TopicUid)
	}

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	logTopic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &ListenNode{
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
			Type:           "Listen",
			LogSubject:     logSubject,
			Fm:             fm,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		ListenTo: listenTo,
		Topic:    topic,
	}, nil
}

func (n *ListenNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("ListenNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting ListenNode with UID: %s", n.NodeUid)

	n.wg.Add(1)
	go n.handleNatsSubscription(log, n.Topic, n.processNatsMessage)
}

func (n *ListenNode) processNatsMessage(msg *nats.Msg, log *logger.Logger) error {
	var rawMessage map[string]interface{}
	if err := json.Unmarshal(msg.Data, &rawMessage); err != nil {
		return fmt.Errorf("failed to unmarshal message for node %s: %w", n.NodeUid, err)
	}

	message := common.Message{
		Payload: rawMessage,
		Topic:   msg.Subject,
	}

	n.sendToOutputs(message, log)
	return nil
}
