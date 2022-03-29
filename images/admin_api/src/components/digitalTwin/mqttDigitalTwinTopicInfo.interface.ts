export default interface IMqttDigitalTwinTopicInfo {
	digitalTwinUid: string;
	topicId: number;
	topicType: string
	groupHash: string;
	deviceHash: string;
	topicHash: string;
}