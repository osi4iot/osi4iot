export default interface ITopicInfoForMqttAcl {
	topicId?: number;
	orgId: number;
	groupId: number;
	topicType: string;
	topicAccessControl: string;
	groupAccessControl: string;
	orgAccessControl: string;
	groupHash: string;
	topicHash: string;
	teamId: number
}