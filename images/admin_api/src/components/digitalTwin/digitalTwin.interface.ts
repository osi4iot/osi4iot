export default interface IDigitalTwin {
	id?: number;
	orgId: number;
	groupId: number;
	assetId: number;
	scope: string;
	digitalTwinUid: string;
	description: string;
	type: string;
	dashboardId: number;
	maxNumResFemFiles: number;
	chatAssistantLanguage: string;
	digitalTwinSimulationFormat: string;
	dashboardUrl: string;
	sensorsRef: string[];
	created?: string;
	updated?: string;
}
