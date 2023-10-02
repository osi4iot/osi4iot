export default interface ITopic {
	id?: number;
	orgId: number;
	groupId: number;
	topicType: string;
	topicName: string;
	description: string;
	topicUid: string;
	mqttAccessControl: string;
	created?: string;
	updated?: string;
}