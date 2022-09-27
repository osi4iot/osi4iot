export default interface ITopic {
	id?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	topicType: string;
	topicName: string;
	description: string;
	topicUid: string;
	payloadFormat: string;
	mqttActionAllowed: string;
	created?: string;
	updated?: string;
}