export default interface IFlow {
	id?: number;
	flowUid: string;
	orgId?: number;
	groupId?: number;
	assetId?: number;
	digitalTwinId: number;
	name: string;
	created?: string;
	updated?: string;
}
