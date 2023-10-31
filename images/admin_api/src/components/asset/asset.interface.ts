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
	created?: string;
	updated?: string;
}
