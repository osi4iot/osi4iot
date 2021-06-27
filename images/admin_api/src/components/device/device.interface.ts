export default interface IDevice {
	id?: number;
	orgId: number;
	groupId: number;
	name: string;
	description: string;
	type: string;
	groupUid?: string;
	deviceUid: string;
	longitude: number;
	latitude: number;
	created?: string;
	updated?: string;
}