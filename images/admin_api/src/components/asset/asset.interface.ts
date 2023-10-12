export default interface IAsset {
	id?: number;
	orgId?: number;
	groupId: number;
	assetUid: string;
	description: string;
	type: string;
	iconRadio: number;
	longitude: number;
	latitude: number;
	geolocationMode: string;
	created?: string;
	updated?: string;
}
