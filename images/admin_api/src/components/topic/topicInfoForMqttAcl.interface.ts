export default interface ITopicInfoForMqttAcl {
	topicId?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	topicType: string;
	topicAccessControl: string;
	deviceAccessControl: string;
	groupAccessControl: string;
	orgAccessControl: string;
	groupHash: string;
	deviceHash: string;
	topicHash: string;
	teamId: number
}