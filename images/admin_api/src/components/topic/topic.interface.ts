export default interface ITopic {
	id?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	sensorName: string;
	description: string;
	sensorType: string;
	topicUid: string;
	payloadFormat: string;
	created?: string;
	updated?: string;
}