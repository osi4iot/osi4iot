export default interface ITopic {
	id?: number;
	orgId: number;
	groupId: number;
	groupUid: string;
	topicType: string;
	topicName: string;
	description: string;
	topicUid: string;
	mqttAccessControl: string;
	// JSON schema of its messages (see messageSchema.ts) and its version
	messageSchema: string | Record<string, unknown>;
	messageSchemaVersion?: number;
	created?: string;
	updated?: string;
}