export default interface ISensor {
	id?: number;
	orgId?: number;
	groupId?: number;
	assetId: number;
	sensorUid: string;
	sensorRef: string;
	sensorType?: string;
	sensorTypeId: number;
	topicId: number;
	topicUid: string;
	topicRef: number;
	description: string;
	dashboardId: number;
	dashboardUrl: string;
	payloadJsonSchema: string;
	created?: string;
	updated?: string;
}
