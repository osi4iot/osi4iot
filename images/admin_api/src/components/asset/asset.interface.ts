export type AssetContext = "asset" | "group" | "organization";

export default interface IAsset {
	id?: number;
	orgId?: number;
	groupId: number;
	assetUid: string;
	description: string;
	assetType?: string;
	assetTypeId: number;
	iconRadio: number;
	iconSizeFactor: number;
	longitude: number;
	latitude: number;
	iconSvgString?: string;
	// asset: a real asset; group / organization: the virtual asset of a group's control room or of an
	// organization's overview (controlRoom.ts)
	context?: AssetContext;
	created?: string;
	updated?: string;
}
