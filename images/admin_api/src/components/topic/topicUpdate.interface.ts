export default interface ITopicUpdate {
	id?: number;
	deviceId: number;
	topicType: string;
	topicName: string;
	description: string;
	topicUid: string;
	payloadFormat: string;
	created?: string;
	updated?: string;
}