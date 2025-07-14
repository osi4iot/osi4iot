export default interface IWire {
	id?: number;
	wireUid?: string;
	name?: string;
	orgId?: number;
	groupId?: number;
	assetId?: number;
	digitalTwinId?: number;
	flowId?: number;
	nodeId?: number;
	nodeIniId: number;
	niniOutputIndex: number;
	nodeEndId: number;
	created?: string;
	updated?: string;
}