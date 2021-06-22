export default interface ITopic {
	id?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	sensorName: string;
	description: string;
	topic: string;
	topicUid: string;
	fieldNames: string[];
	fieldUnits: string[];
	created?: string;
	updated?: string;
}