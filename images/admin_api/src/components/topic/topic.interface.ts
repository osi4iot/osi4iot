export default interface ITopic {
	id?: number;
	orgId: number;
	groupId: number;
	topicType: string;
	topicName: string;
	description: string;
	topicUid: string;
	payloadJsonSchema: string;
	mqttAccessControl: string;
	requireS3Storage: boolean;
	s3Folder: string;
	lastS3Storage: string;
	parquetSchema: string;
	created?: string;
	updated?: string;
}