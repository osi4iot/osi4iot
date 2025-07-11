package flows_manager

import "fmt"

func makeDTNodesKey(digitalTwinId int) string {
	return fmt.Sprintf("dt:nodes:%d", digitalTwinId)
}

func makeDTWiresKey(digitalTwinId int) string {
	return fmt.Sprintf("dt:wires:%d", digitalTwinId)
}

func makeNodeOutputWiresKey(digitalTwinId int, nodeID int) string {
	return fmt.Sprintf("dt:%d:out:%d", digitalTwinId, nodeID)
}

func makeNodeInputWiresKey(digitalTwinId int, nodeID int) string {
	return fmt.Sprintf("dt:%d:in:%d", digitalTwinId, nodeID)
}

func makeNodeOutputIndexKey(digitalTwinId int, nodeID int, outputIndex int) string {
	return fmt.Sprintf("dt:%d:outidx:%d:%d", digitalTwinId, nodeID, outputIndex)
}

func makeDigitalTwinTopicRefKey(digitalTwinId int, topicRef int) string {
	return fmt.Sprintf("dt:%d:topicRef:%d", digitalTwinId, topicRef)
}

func makeAssetTopicRefKey(assetId int, topicRef int) string {
	return fmt.Sprintf("asset:%d:topicRef:%d", assetId, topicRef)
}