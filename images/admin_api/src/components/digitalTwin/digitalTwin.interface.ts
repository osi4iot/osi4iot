export default interface IDigitalTwin {
	id?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	name: string;
	description: string;
	type: string;
	dashboardId: number;
	gltfData: string;
	gltfFileName: string;
	gltfFileLastModifDateString: string;
	femSimulationData: string;
	femSimDataFileName: string;
	femSimDataFileLastModifDateString: string;
	digitalTwinSimulationFormat: string;
	sensorSimulationTopicId: number;
	assetStateTopicId: number;
	assetStateSimulationTopicId: number;
	femResultModalValuesTopicId: number;
	femResultModalValuesSimulationTopicId: number;
	created?: string;
	updated?: string;
	dashboardUrl: string;
}