export default interface IDevice {
	id?: number;
	orgId: number;
	groupId: number;
	mqttPassword?: string;
	mqttSalt?: string;
	mqttAccessControl?: string;
	groupUid?: string;
	deviceUid: string;
	created?: string;
	updated?: string;
}