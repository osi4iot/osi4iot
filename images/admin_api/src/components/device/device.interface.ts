export default interface IDevice {
	id?: number;
	orgId: number;
	groupId: number;
	type: string;
	mqttPassword?: string;
	mqttSalt?: string;
	mqttAccessControl?: string;
	groupUid?: string;
	deviceUid: string;
	iconRadio: number;
	masterDeviceUrl?: string;
	longitude: number;
	latitude: number;
	created?: string;
	updated?: string;
}