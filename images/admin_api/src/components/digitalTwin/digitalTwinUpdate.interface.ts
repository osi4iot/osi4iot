export default interface IDigitalTwinUpdate {
	id?: number;
	deviceId: number;
	name: string;
	description: string;
	type: string;
	dashboardId?: number;
	gltfData?: string;
	created?: string;
	updated?: string;
}