export default interface IDigitalTwin {
	id?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	name: string;
	description: string;
	type: string;
	url: string;
	created?: string;
	updated?: string;
}