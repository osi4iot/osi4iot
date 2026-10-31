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
	topicRef: string; // e.g. "dev2pdb_2" (asset_topic.topic_ref)
	description: string;
	dashboardId: number;
	dashboardUrl: string;
	measurements: string;
	created?: string;
	updated?: string;
}
