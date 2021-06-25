export default interface IDigitalTwinUpdate {
	id?: number;
	deviceId: number;
	name: string;
	description: string;
	type: string;
	url: string;
	created?: string;
	updated?: string;
}