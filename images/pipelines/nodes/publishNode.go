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
)

type PublishNode struct {
	BaseNode
	PublishTo string
	Topic     string
}

var posiblePublishToForPublishNode = []string{
	"Generic nats",
	"Generic mqtt",
	"Topic reference",
	"Message topic",
}

func CreatePublishNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*PublishNode, error) {
	publishTo, ok := node.Settings["publishTo"].(string)
	if !ok || publishTo == "" {
		fm.Log().Errorf("PublishNode %s: 'publishTo' setting is required", node.NodeUid)
		return nil, fmt.Errorf("publishTo setting is required")
	}

	// Validate publishTo
	if !slices.Contains(posiblePublishToForPublishNode, publishTo) {
		fm.Log().Errorf("PublishNode %s: invalid 'publishTo' setting", node.NodeUid)
		return nil, fmt.Errorf("invalid publishTo setting")
	}

	topic, ok := node.Settings["topic"].(string)
	if !ok || topic == "" {
		fm.Log().Errorf("PublishNode %s: 'topic' setting is required", node.NodeUid)
		return nil, fmt.Errorf("topic setting is required")
	}

	switch publishTo {
	case "Generic mqtt":
		topic = strings.ReplaceAll(topic, "/", ".")
	case "Topic reference":
		topicRef := topic
		topicInstance := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), topicRef)
		if topicInstance == nil {
			fm.Log().Errorf("PublishNode %s: topic reference '%s' not found", node.NodeUid, topicRef)
			return nil, fmt.Errorf("topic reference '%s' not found", topicRef)
		}
		topic = utils.TopicToNatsSubject(topicInstance.TopicType, topicInstance.GroupUid, topicInstance.TopicUid)
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &PublishNode{
		BaseNode: BaseNode{
			NodeUid:        node.NodeUid,
			Name:           node.Name,
			Xpos:           node.Xpos,
			Ypos:           node.Ypos,
			NumOutputs:     node.NumOutputs,
			Settings:       node.Settings,
			Debug:          node.Debug,
			Type:           "Publish",
			LogSubject:     logSubject,
			Fm:             fm,
			Pipeline:       p,
			Cancel:         cancel,
			Ctx:            ctx,
			status:         common.NodeStatusCreated,
		},
		PublishTo: publishTo,
		Topic:     topic,
	}, nil
}

func (n *PublishNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("PublishNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting PublishNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *PublishNode) processMessage(msg common.Message, log *logger.Logger) error {
	jsonData, err := json.Marshal(msg.Payload)
	if err != nil {
		return fmt.Errorf("failed to marshal message for node %s: %w", n.NodeUid, err)
	}

	subject := n.Topic
	return n.Fm.NatsPublish(subject, jsonData)
}
