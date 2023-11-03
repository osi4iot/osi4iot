import { SchemaInterface } from "parquetjs/lib/schema.interface";

export default interface ITopic {
	orgId: number;
    groupId: number;
    assetId: number;
    topicId: number;
	groupUid: string;
	topicUid: string;
	requireS3Storage: boolean;
	s3Folder: string;
	parquetSchema: SchemaInterface;
	lastS3Storage: string;
}