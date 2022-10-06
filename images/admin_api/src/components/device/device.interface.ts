export default interface IDevice {
	id?: number;
	orgId: number;
	groupId: number;
	name: string;
	description: string;
	type: string;
	mqttPassword?: string;
	mqttSalt?: string;
	mqttActionAllowed?: string;
	groupUid?: string;
	deviceUid: string;
	iconRatio: number;
	masterDeviceUrl?: string;
	longitude: number;
	latitude: number;
	created?: string;
	updated?: string;
}