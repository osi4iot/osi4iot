export default interface IDigitalTwin {
	id?: number;
	orgId: number;
	groupId: number;
	deviceId: number;
	digitalTwinUid: string;
	description: string;
	type: string;
	dashboardId: number;
	maxNumResFemFiles: number;
	digitalTwinSimulationFormat: string;
	created?: string;
	updated?: string;
	dashboardUrl: string;
}
