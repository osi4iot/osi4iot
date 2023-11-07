import { SingleFieldInterface } from "parquetjs/lib/schema.interface";

interface SingleFieldInterfaceExtended extends SingleFieldInterface{
    compression: string;
}

export interface SchemaInterface {
    [key: string]: SingleFieldInterfaceExtended;
}

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