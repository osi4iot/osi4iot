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

type PublishNode struct {
	BaseNode
	PublishTo string
	Topic     string
}

var posiblePublishToForPublishNode = []string{
	"Generic nats",
	"Generic mqtt",
	"Topic reference",
	"Reply",
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

	var topic string
	if publishTo != "Reply" {
		topic, ok = node.Settings["topic"].(string)
		if !ok || topic == "" {
			fm.Log().Errorf("PublishNode %s: 'topic' setting is required", node.NodeUid)
			return nil, fmt.Errorf("topic setting is required")
		}
		switch publishTo {
		case "Generic mqtt":
			topic = strings.ReplaceAll(topic, "/", ".")
		case "Topic reference":
			topicRef := topic
			group := fm.GetGroup(p.GetGroupId())
			if group == nil {
				fm.Log().Errorf("PublishNode %s: group with ID %d not found", node.NodeUid, p.GetGroupId())
				return nil, fmt.Errorf("group with ID %d not found", p.GetGroupId())
			}

			if group.IsAdminGroup && strings.HasPrefix(topicRef, "system_") {
				topicsMap := fm.GetTopicsByAssetId(p.GetAssetId())
				topicInstance, ok := topicsMap[topicRef]
				if !ok || topicInstance == nil {
					fm.Log().Errorf("PublishNode %s: topic reference '%s' not found", node.NodeUid, topicRef)
					return nil, fmt.Errorf("topic reference '%s' not found", topicRef)
				}
				topic = utils.SystemMonitoringNatsSubject(topicInstance.Description)
			} else {
				topicInstance := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), topicRef)
				if topicInstance == nil {
					fm.Log().Errorf("PublishNode %s: topic reference '%s' not found", node.NodeUid, topicRef)
					return nil, fmt.Errorf("topic reference '%s' not found", topicRef)
				}
				topic = utils.TopicToNatsSubject(topicInstance.TopicType, topicInstance.GroupUid, topicInstance.TopicUid)
			}
		}
	}

	logTopic := fm.GetTopicByTopicRef(p.GetAssetId(), p.GetDigitalTwinId(), "dtmlog")
	logSubject := utils.TopicToNatsSubject(logTopic.TopicType, logTopic.GroupUid, logTopic.TopicUid)

	return &PublishNode{
		BaseNode: BaseNode{
			NodeUid:    node.NodeUid,
			Name:       node.Name,
			Xpos:       node.Xpos,
			Ypos:       node.Ypos,
			NumOutputs: node.NumOutputs,
			Settings:   node.Settings,
			Debug:      node.Debug,
			Type:       "Publish",
			LogSubject: logSubject,
			Fm:         fm,
			Pipeline:   p,
			Cancel:     nil,
			Ctx:        nil,
			status:     common.NodeStatusCreated,
		},
		PublishTo: publishTo,
		Topic:     topic,
	}, nil
}

func (n *PublishNode) Start(ctx context.Context, log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("PublishNode %s is already running", n.NodeUid)
		return
	}

	nodectx, nodeCancel := context.WithCancel(ctx)
	n.Ctx = nodectx
	n.Cancel = nodeCancel

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting PublishNode with UID: %s", n.NodeUid)

	n.handleInputWires(log, n.processMessage)
}

func (n *PublishNode) processMessage(msg common.Message, log *logger.Logger) error {
	var subject string
	switch n.PublishTo {
	case "Reply":
		if !msg.IsRequest() {
			log.Warnf("PublishNode %s: no reply context, skipping", n.NodeUid)
			return nil
		}
		replyCtx := msg.GetReplyContext()
		if replyCtx.IsExpired() {
			log.Warnf("PublishNode %s: reply expired for subject %s, skipping", n.NodeUid, replyCtx.Subject)
			return nil
		}
		subject = replyCtx.Subject
	default:
		subject = n.Topic
		if subject == "" {
			subject = msg.GetTopic()
		}
	}

	// Serialización — igual que antes
	header := nats.Header{}
	header.Set("Content-Type", msg.GetContentType())
	header.Set("Json-Structure", msg.GetJsonStructure())

	var data []byte
	var err error

	if msg.HasFile() {
		data = msg.GetFile().Data
		header.Set("Content-Type", msg.GetFile().ContentType)
	} else {
		switch msg.GetJsonStructure() {
		case "array":
			if msgArray, ok := msg.GetPayload()["msgArray"]; ok {
				data, err = json.Marshal(msgArray)
			} else {
				data, err = json.Marshal(msg.GetPayload())
			}
		default:
			data, err = json.Marshal(msg.GetPayload())
		}
		if err != nil {
			return fmt.Errorf("failed to marshal message for node %s: %w", n.NodeUid, err)
		}
	}

	return n.Fm.NatsPublishWithHeaders(subject, header, data)
}
