package flows_manager

import "fmt"

func makeDigitalTwinTopicRefKey(digitalTwinId int, topicRef string) string {
	return fmt.Sprintf("dt:%d:topicRef:%s", digitalTwinId, topicRef)
}

func makeAssetTopicRefKey(assetId int, topicRef string) string {
	return fmt.Sprintf("asset:%d:topicRef:%s", assetId, topicRef)
}
