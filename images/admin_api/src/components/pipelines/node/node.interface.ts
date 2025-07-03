export default interface INode {
	id?: number;
	nodeUid?: string;
	orgId?: number;
	groupId?: number;
	assetId?: number;
	digitalTwinId: number;
	name: string;
	type: string;
	x: number;
	y: number;
	numOutputs: number;
	settings: string;
	created?: string;
	updated?: string;
}
