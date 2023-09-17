export default interface IAsset {
	id?: number;
	orgId?: number;
	groupId: number;
	assetUid: string;
	name: string;
	description: string;
	type: string;
	iconRadio: number;
	longitude: number;
	latitude: number;
	created?: string;
	updated?: string;
}
