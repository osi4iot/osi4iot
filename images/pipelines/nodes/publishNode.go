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
	SubjectType string
	Subject     string
}

var posibleSubjectTypesForPublishNode = []string{
	"Generic nats",
	"Generic mqtt",
	"Topic reference",
	"Message subject",
}

func CreatePublishNode(node common.NodeData, fm common.Manager) *PublishNode {
	subjectType, ok := node.Settings["subjectType"].(string)
	if !ok || subjectType == "" {
		fm.Log().Errorf("PublishNode %s: 'subjectType' setting is required", node.NodeUid)
		return nil
	}

	// Validate subjectType
	if !slices.Contains(posibleSubjectTypesForPublishNode, subjectType) {
		fm.Log().Errorf("PublishNode %s: invalid 'subjectType' setting", node.NodeUid)
		return nil
	}

	subject, ok := node.Settings["subject"].(string)
	if !ok || subject == "" {
		fm.Log().Errorf("PublishNode %s: 'subject' setting is required", node.NodeUid)
		return nil
	}

	switch subjectType {
	case "Generic mqtt":
		subject = strings.ReplaceAll(subject, "/", ".")
	case "Topic reference":
		topicRef := subject
		topic := fm.GetTopicByTopicRef(node.AssetId, node.DigitalTwinId, topicRef)
		subject = utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
	}

	org := fm.GetOrg(node.OrgId)
	digitalTwin := fm.GetDigitalTwin(node.DigitalTwinId)

	ctx, cancel := context.WithCancel(context.Background())
	return &PublishNode{
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
			Type:          "Publish",
			Fm:            fm,
			Cancel:        cancel,
			Ctx:           ctx,
			status:        common.NodeStatusCreated,
		},
		SubjectType: subjectType, // Default subject type
		Subject:     subject,
	}
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

	subject := n.Subject
	if n.SubjectType == "Message subject" {
		subject = msg.Subject // Use the subject from the message
	}

	return n.Fm.NatsPublish(subject, jsonData)
}
