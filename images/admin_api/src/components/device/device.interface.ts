export default interface IDevice {
	id?: number;
	orgId: number;
	groupId: number;
	name: string;
	description: string;
	isDefaultGroupDevice: boolean;
	groupUid?: string;
	deviceUid: string;
	longitude: number;
	latitude: number;
	created?: string;
	updated?: string;
}