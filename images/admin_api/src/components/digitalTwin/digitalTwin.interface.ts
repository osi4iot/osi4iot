export default interface IDigitalTwin {
	id?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	name: string;
	description: string;
	type: string;
	dashboardId: number;
	gltfData: string;
	created?: string;
	updated?: string;
	mqttTopics?: string[];
	dashboardUrls?: string[];
}