export default interface ISensor {
	id?: number;
	orgId?: number;
	groupId?: number;
	assetId: number;
	sensorUid: string;
	topicId: number;
	description: string;
	sensorTypeId: number;
	dashboardId: number;
	dashboardUrl: string;
	created?: string;
	updated?: string;
}
