export default interface ITopicInfoForMqttAcl {
	topicId?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	topicType: string;
	topicActionAllowed: string;
	deviceActionAllowed: string;
	groupActionAllowed: string;
	orgActionAllowed: string;
	groupHash: string;
	deviceHash: string;
	topicHash: string;
	teamId: number
}