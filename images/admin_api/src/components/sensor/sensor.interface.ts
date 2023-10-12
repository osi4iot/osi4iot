export default interface ISensor {
	id?: number;
	orgId?: number;
	groupId?: number;
	assetId: number;
	sensorUid: string;
	type: string;
	description: string;
	topicId: number;
	payloadKey: string;
	paramLabel: string;
	valueType: string;
	units: string;
	dashboardId: number;
	dashboardUrl: string;
	created?: string;
	updated?: string;
}
