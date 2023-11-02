export default interface ITopic {
	orgId: number;
    groupId: number;
    assetId: number;
    topicId: number;
	groupUid: string;
	topicUid: string;
	requireS3Storage: boolean;
	s3Folder: string;
	parquetSchema: string;
	lastS3Storage: string;
}