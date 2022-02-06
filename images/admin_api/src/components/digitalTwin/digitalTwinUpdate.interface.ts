export default interface IDigitalTwinUpdate {
	id?: number;
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
	assetStateTopicId: number;
	assetStateSimulationTopicId: number;
	femResultModalValuesTopicId: number;
	femResultModalValuesSimulationTopicId: number;
	created?: string;
	updated?: string;
}