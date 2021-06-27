export default interface ITopicUpdate {
	id?: number;
	deviceId: number;
	sensorName: string;
	description: string;
	sensorType: string;
	topicUid: string;
	payloadFormat: string;
	created?: string;
	updated?: string;
}