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
	created?: string;
	updated?: string;
}