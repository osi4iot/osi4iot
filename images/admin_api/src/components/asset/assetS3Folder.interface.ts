export default interface IAssetS3Folder {
	topicId?: number;
	orgId: number;
	orgAcronym: string;
	groupId: number;
	groupAcronym: string;
	assetId: number;
	assetUid: string;
	assetDescription: string;
	s3Folder: string;
	years?: string[];
}