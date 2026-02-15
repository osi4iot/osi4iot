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
	Topics   []string
}

var posibleListenToForListenNode = []string{
	"Generic nats",
	"Generic mqtt",
	"Topic reference",
}

func CreateListenNode(node common.NodeData, fm common.Manager, p common.Pipeline) (*ListenNode, error) {
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

	singleTopic, ok := node.Settings["topic"].(string)
	if !ok || singleTopic == "" {
		fm.Log().Errorf("ListenNode %s: 'topic' setting is required", node.NodeUid)
		return nil, fmt.Errorf("topic setting is required")
	}
	var topics []string

	switch listenTo {
	case "Generic nats":
		topics = append(topics, singleTopic)
	case "Generic mqtt":
		singleTopic = strings.ReplaceAll(singleTopic, "/", ".")
		topics = append(topics, singleTopic)
	case "Topic reference":
		topicRef := singleTopic
		if topicRef == "all_dev2pdb" {
			topicsMap := fm.GetTopicsByAssetId(p.GetAssetId())
			for _, topicInstance := range topicsMap {
				if topicInstance != nil {
					topic := utils.TopicToNatsSubject(topicInstance.TopicType, topicInstance.GroupUid, topicInstance.TopicUid)
					topics = append(topics, topic)
				}
			}
		} else {
			topicInstance := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), topicRef)
			if topicInstance == nil {
				fm.Log().Errorf("ListenNode %s: topic reference '%s' not found", node.NodeUid, topicRef)
				return nil, fmt.Errorf("topic reference '%s' not found", topicRef)
			}
			topic := utils.TopicToNatsSubject(topicInstance.TopicType, topicInstance.GroupUid, topicInstance.TopicUid)
			topics = append(topics, topic)
		}
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	ctx, cancel := context.WithCancel(context.Background())
	return &ListenNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Listen",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     cancel,
			Ctx:        ctx,
			status:     common.NodeStatusCreated,
		},
		ListenTo: listenTo,
		Topics:   topics,
	}, nil
}

func (n *ListenNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("ListenNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting ListenNode with UID: %s", n.NodeUid)

	for _, topic := range n.Topics {
		log.Infof("ListenNode %s subscribing to topic: %s", n.NodeUid, topic)
		n.wg.Add(1)
		go n.handleNatsSubscription(log, topic, n.processNatsMessage)
	}
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
