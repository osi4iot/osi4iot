package utils

import (
	"fmt"
	"pipelines/common"
)

func GetTopicByTopicRef(topicMap map[string]*common.Topic, topicRef string) string {
	for key, topic := range topicMap {
		if key == topicRef {
			return fmt.Sprintf("Topic_%s", topic.TopicUid)
		}
	}
	return ""
}