import { ISensorRef, ITopicRef } from "./digitalTwinDAL";

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
	digitalTwinSimulationFormat: string;
	dtRefFileName: string;
	dtRefFileLastModifDate: string;
	dashboardUrl: string;
	topicsRef?: ITopicRef[];
	sensorsRef?: ISensorRef[];
	created?: string;
	updated?: string;
}
