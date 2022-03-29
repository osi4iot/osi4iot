export default interface IDigitalTwinUpdate {
	id?: number;
	deviceId: number;
	digitalTwinUid: string;
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
	created?: string;
	updated?: string;
}