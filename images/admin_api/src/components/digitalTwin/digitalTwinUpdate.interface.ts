export default interface IDigitalTwinUpdate {
	id?: number;
	deviceId: number;
	name: string;
	description: string;
	type: string;
	url: string;
	dashboardId: number;
	created?: string;
	updated?: string;
}