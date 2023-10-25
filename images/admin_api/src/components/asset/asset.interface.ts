export default interface IAsset {
	id?: number;
	orgId?: number;
	groupId: number;
	assetUid: string;
	description: string;
	assetTypeId: number;
	iconRadio: number;
	longitude: number;
	latitude: number;
	iconSvgString?: string;
	created?: string;
	updated?: string;
}
