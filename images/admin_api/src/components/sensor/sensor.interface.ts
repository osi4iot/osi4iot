export default interface ISensor {
	id?: number;
	orgId?: number;
	groupId?: number;
	assetId: number;
	sensorUid: string;
	topicId: number;
	topicUid: string;
	sensorRef: string;
	description: string;
	sensorTypeId: number;
	dashboardId: number;
	dashboardUrl: string;
	payloadJsonSchema: string;
	created?: string;
	updated?: string;
}
