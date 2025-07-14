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
	SubjectType string
	Subject string
}

var posibleSubjectTypesForListenNode = []string{
	"Generic nats",
	"Generic mqtt",
	"Topic reference",
}

func CreateListenNode(node common.NodeData, fm common.Manager) *ListenNode {
	subjectType, ok := node.Settings["subjectType"].(string)
	if !ok || subjectType == "" {
		fm.Log().Errorf("ListenNode %s: 'subjectType' setting is required", node.NodeUid)
		return nil
	}

	// Validate subjectType
	if !slices.Contains(posibleSubjectTypesForListenNode, subjectType) {
		fm.Log().Errorf("ListenNode %s: invalid 'subjectType' setting", node.NodeUid)
		return nil
	}

	subject, ok := node.Settings["subject"].(string)
	if !ok || subject == "" {
		fm.Log().Errorf("ListenNode %s: 'subject' setting is required", node.NodeUid)
		return nil
	}

	switch subjectType {
	case "Generic nats":
		// No specific processing needed for Generic nats
	case "Generic mqtt":
		subject = strings.ReplaceAll(subject, "/", ".")
	case "Topic reference":
		topicRef := subject
		topic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, topicRef)
		if topic == nil {
			fm.Log().Errorf("ListenNode %s: topic reference '%s' not found", node.NodeUid, topicRef)
			return nil
		}
		subject = utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
	}

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	ctx, cancel := context.WithCancel(context.Background())
	return &ListenNode{
		BaseNode: BaseNode{
			Id:            node.Id,
			NodeUid:       node.NodeUid,
			OrgId:         node.OrgId,
			OrgHash:       org.OrgHash,
			GroupId:       node.GroupId,
			AssetId:       node.AssetId,
			DigitalTwinId: node.DigitalTwinId,
			DigitalTwinUID: digitalTwin.DigitalTwinUID,
			Name:          node.Name,
			Xpos:          node.Xpos,
			Ypos:          node.Ypos,
			NumOutputs:    node.NumOutputs,
			Settings:      node.Settings,
			Type:          "Listen",
			Fm:            fm,
			Cancel:        cancel,
			Ctx:           ctx,
			status:        common.NodeStatusCreated,
		},
		SubjectType: subjectType,
		Subject: subject,
	}
}

func (n *ListenNode) Start(log *logger.Logger, needReinitialization bool) {
	if n.GetStatus() == common.NodeStatusRunning {
		log.Infof("ListenNode %s is already running", n.NodeUid)
		return
	}

	n.SetStatus(common.NodeStatusRunning)
	log.Infof("Starting ListenNode with UID: %s", n.NodeUid)

	n.wg.Add(1)
	go n.handleNatsSubscription(log, n.Subject, n.processNatsMessage)
}

func (n *ListenNode) processNatsMessage(msg *nats.Msg, log *logger.Logger) error {
	var rawMessage map[string]interface{}
	if err := json.Unmarshal(msg.Data, &rawMessage); err != nil {
		return fmt.Errorf("failed to unmarshal message for node %s: %w", n.NodeUid, err)
	}

	message := common.Message{
		Payload: rawMessage,
		Subject: msg.Subject,
	}

	n.sendToOutputs(message, log)
	return nil
}