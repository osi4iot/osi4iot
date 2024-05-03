export default interface ISensor {
	id?: number;
	orgId?: number;
	groupId?: number;
	groupUid: string;
	assetId: number;
	assetUid: string;
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
