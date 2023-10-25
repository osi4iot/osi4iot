export default interface IAssetType {
	id?: number;
	orgId?: number;
	assetTypeUid: string;
	type: string;
	iconSvgFileName: string;
	iconSvgString: string;
	geolocationMode: string;
	markerSvgFileName: string;
	markerSvgString: string;
	isPredefined: boolean;
	assetStateFormat: string;
	created?: string;
	updated?: string;
}