export default interface INode {
	id?: number;
	nodeUid?: string;
	orgId?: number;
	groupId?: number;
	assetId?: number;
	digitalTwinId?: number;
	flowId: number;
	name: string;
	type: string;
	x: number;
	y: number;
	numOutputs: number;
	metadata: string;
	created?: string;
	updated?: string;
}
