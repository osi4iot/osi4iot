package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"pipelines/common"
	"pipelines/logger"
	"pipelines/message"
	"pipelines/utils"
	"slices"
	"strconv"
	"strings"
	"time"

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
				if topicInstance != nil && strings.HasPrefix(topicInstance.TopicType, "dev2pdb") {
					topic := utils.TopicToNatsSubject(topicInstance.TopicType, topicInstance.GroupUid, topicInstance.TopicUid)
					topics = append(topics, topic)
				}
			}
		} else {
			group := fm.GetGroup(p.GetGroupId())
			if group == nil {
				fm.Log().Errorf("ListenNode %s: group with ID %d not found", node.NodeUid, p.GetGroupId())
				return nil, fmt.Errorf("group with ID %d not found", p.GetGroupId())
			}

			if group.IsAdminGroup && strings.HasPrefix(topicRef, "system_") {
				topicsMap := fm.GetTopicsByAssetId(p.GetAssetId())
				topicInstance, ok := topicsMap[topicRef]
				if !ok || topicInstance == nil {
					fm.Log().Errorf("ListenNode %s: topic reference '%s' not found", node.NodeUid, topicRef)
					return nil, fmt.Errorf("topic reference '%s' not found", topicRef)
				}
				topic := utils.SystemMonitoringNatsSubject(topicInstance.Description)
				topics = append(topics, topic)
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
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

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
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		ListenTo: listenTo,
		Topics:   topics,
	}, nil
}

func (n *ListenNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("ListenNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting ListenNode with UID: %s", n.NodeUid)

	for _, topic := range n.Topics {
		log.Infof("Subscribing to topic: %s", topic)
		n.wg.Add(1)
		go n.handleNatsSubscription(log, topic, n.processNatsMessage)
	}
}

func (n *ListenNode) processNatsMessage(msg *nats.Msg, log *logger.Logger) error {
	contentType := "application/json"
	jsonStructure := "object"

	if msg.Header != nil {
		if ct := msg.Header.Get("Content-Type"); ct != "" {
			contentType = ct
		}
		if js := msg.Header.Get("Json-Structure"); js != "" {
			jsonStructure = js
		}
	}

	outMsg, err := n.buildMessageFromNats(msg, contentType, jsonStructure)
	if err != nil {
		return fmt.Errorf("failed to build message for node %s: %w", n.NodeUid, err)
	}

	if msg.Reply != "" {
		timeoutMs := int64(30000)
		if msg.Header != nil {
			if v := msg.Header.Get("Reply-Timeout-Ms"); v != "" {
				if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
					timeoutMs = parsed
				}
			}
		}
		outMsg.SetReplyContext(&common.ReplyContext{
			Subject:   msg.Reply,
			ExpiresAt: time.Now().Add(time.Duration(timeoutMs) * time.Millisecond),
		})
	}

	n.sendToOutputs(outMsg, log)
	return nil
}

func (n *ListenNode) buildMessageFromNats(msg *nats.Msg, contentType, jsonStructure string) (common.Message, error) {
	switch contentType {
	case "application/json":
		switch jsonStructure {
		case "array":
			var rawArray []map[string]any
			if err := json.Unmarshal(msg.Data, &rawArray); err != nil {
				return nil, fmt.Errorf("failed to unmarshal JSON array: %w", err)
			}
			outMsg := message.NewMessage(msg.Subject, map[string]any{
				"rows": rawArray,
			}, nil, contentType, nil)
			outMsg.JsonStructure = jsonStructure
			return outMsg, nil

		default:
			var rawMessage map[string]any
			if err := json.Unmarshal(msg.Data, &rawMessage); err != nil {
				return nil, fmt.Errorf("failed to unmarshal JSON object: %w", err)
			}
			return message.NewMessage(msg.Subject, rawMessage, nil, contentType, nil), nil
		}

	default:
		outMsg := message.NewMessage(msg.Subject, map[string]any{}, nil, contentType, &common.File{
			Name:        msg.Subject,
			ContentType: contentType,
			Data:        msg.Data,
		})
		outMsg.JsonStructure = jsonStructure
		return outMsg, nil
	}
}
