export default interface IMobileTopic {
	id: number;
	orgAcronym: string;
	groupAcronym: string;
	assetDescription: string;
	sensorType: string;
	sensorDescription: string;
	groupUid: string;
	assetUid: string;
	topicUid: string;
	// Mobile audio: the MQTT topic (sim2state) of the chat of the asset's digital twin, when it takes voice messages
	chatMqttTopic?: string | null;
}