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

func (u *Utils) GetTopicTypeFromMessage(msg common.Message) string {
	return strings.Split(msg.Topic, ".")[0]
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
