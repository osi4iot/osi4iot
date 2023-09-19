export default interface ISensor {
	id?: number;
	orgId?: number;
	groupId?: number;
	assetId: number;
	sensorUid: string;
	name: string;
	description: string;
	topicId: number;
	payloadKey: string;
	paramLabel: string;
	valueType: string;
	units: string;
	dashboardId: number;
	created?: string;
	updated?: string;
}
