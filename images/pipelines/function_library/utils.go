package function_library

import (
	"pipelines/common"
	"pipelines/utils"
	"strings"
)

type Utils struct {
	node common.Node
	fm   common.Manager
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
	if err != nil || message.GetTopic() == "" {
		return ""
	}
	return strings.Split(message.GetTopic(), ".")[0]
}

func (u *Utils) GetTopicRefFromMessage(rawMsg any) string {
	message, err := utils.GetMessageFromRaw(rawMsg)
	if err != nil {
		return ""
	}

	topics := u.fm.GetTopicsByAssetId(u.node.GetAssetId())
	for key, topic := range topics {
		if utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid) == message.GetTopic() {
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
	return message.GetTopic()
}

func (u *Utils) GetTopicFromMessage(rawMsg any) string {
	message, err := utils.GetMessageFromRaw(rawMsg)
	if err != nil || message.GetTopic() == "" {
		return ""
	}
	return strings.Split(message.GetTopic(), ".")[2]
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