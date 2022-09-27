export default interface ITopicInfoForMqttAcl {
	topicId?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	topicType: string;
	mqttActionAllowed: string;
	groupHash: string;
	deviceHash: string;
	topicHash: string;
	teamId: number
}