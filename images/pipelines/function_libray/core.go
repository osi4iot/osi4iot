package function_libray

import (
	"pipelines/common"
	"pipelines/logger"
	"pipelines/utils"
	"strings"
)

func GetJSFunctions(node common.Node, fm common.Manager, log *logger.Logger) []common.JSFunction {
	return []common.JSFunction{
		{
			Name: "Go",
			Func: func() *Golang {
				return newGolang(node, fm, log)
			},
		},
		{
			Name: "getTopic",
			Func: func(topicRef string) string {
				return getTopic(fm, node, topicRef)
			},
		},
		{
			Name: "getTopicType",
			Func: func(msg common.Message) string {
				return getTopicType(msg)
			},
		},
	}
}

type Golang struct {
	node common.Node
	log  *logger.Logger
	fm   common.Manager
}

func newGolang(node common.Node, fm common.Manager, log *logger.Logger) *Golang {
	return &Golang{
		node: node,
		log:  log,
		fm:   fm,
	}
}

func (g *Golang) Logger() *NodeLogger {
	return newLogger(g.node)
}

func (g *Golang) Time() *Time {
	return NewTime(g.node)
}

func (g *Golang) KvStore() *KvStore {
	return NewKvStore(g.node, g.fm, g.log)
}

func (g *Golang) Http() *Http {
	return NewHttp(g.node, g.log)
}

func (g *Golang) All() map[string]interface{} {
	log := newLogger(g.node)
	time := NewTime(g.node)
	kvStore := NewKvStore(g.node, g.fm, g.log)
	http := NewHttp(g.node, g.log)
	instanceMap := map[string]interface{}{
		"log":     log,
		"time":    time,
		"kvStore": kvStore,
		"http":    http,
	}
	return instanceMap
}

func getTopic(fm common.Manager, node common.Node, topicRef string) string {
	topic := fm.GetTopicByTopicRef(node.GetAssetId(), node.GetDigitalTwinId(), topicRef)
	if topic == nil {
		return ""
	}
	return utils.TopicToNatsSubject(topic.TopicType, topic.GroupUid, topic.TopicUid)
}

func getTopicType(msg common.Message) string {
	return strings.Split(msg.Topic, ".")[0]
}
