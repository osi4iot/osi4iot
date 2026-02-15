package function_library

import (
	"pipelines/common"
	"pipelines/utils"
	"strings"
)

type Utils struct {
	node common.Node
	fm  common.Manager
}

func NewUtils(node common.Node, fm common.Manager) *Utils {
	return &Utils{
		node: node,
		fm:   fm,
	}
}

func (u *Utils) GetTopicByRef(topicRef string) string {
	topic := u.fm.GetTopicByTopicRef(u.node.GetAssetId(), u.node.GetDigitalTwinId(), topicRef)
	if topic == nil {
		return ""
	}
	return utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
}

func (u *Utils) GetTopicTypeFromMessage(rawMsg any) string {
	message, err := utils.GetMessageFromRaw(rawMsg)
	if err != nil {
		return ""
	}
	
	if message.Topic == "" {
		return ""
	}

	return strings.Split(message.Topic, ".")[0]
}

func (u *Utils) GetTopicRefFromMessage(rawMsg any) string {
	message, err := utils.GetMessageFromRaw(rawMsg)
	if err != nil {
		return ""
	}

	assetId := u.node.GetAssetId()
	topics := u.fm.GetTopicsByAssetId(assetId)
	for key, topic := range topics {
		topicSubject := utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
		if topicSubject == message.Topic {
			return key
		}
	}

	return ""
}

func (u *Utils) GetFullTopicFromMessage(rawMsg any) string {
	message, err := utils.GetMessageFromRaw(rawMsg)
	if err != nil {
		return ""
	}

	return message.Topic
}

func (u *Utils) GetTopicFromMessage(rawMsg any) string {
	message, err := utils.GetMessageFromRaw(rawMsg)
	if err != nil {
		return ""
	}

	if message.Topic == "" {
		return ""
	}

	topicParts := strings.Split(message.Topic, ".")
	return topicParts[2]
}


func (u *Utils) Nil() any {
	return nil
}

func (u *Utils) GetComplex64(real float32, imag float32) complex64 {
	return complex64(complex(real, imag))
}


func (u *Utils) GetComplex128(real float64, imag float64) complex128 {
	return complex(real, imag)
}
