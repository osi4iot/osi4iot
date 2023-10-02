export default interface IGroup {
	id?: number;
	orgId: number;
	teamId: number;
	folderId: number;
	folderUid: string;
	folderPermission?: string;
	name: string;
	acronym: string;
	groupUid: string;
	telegramInvitationLink: string;
	telegramChatId: string;
	emailNotificationChannelId: number;
	telegramNotificationChannelId: number;
	isOrgDefaultGroup: boolean;
	outerBounds: number[][];
	floorNumber: number;
	featureIndex: number;
	mqttPassword?: string;
	mqttSalt?: string;
	mqttAccessControl: string;
	nriInGroupId?: number;
	nriInGroupHash?: string;
	nriInGroupIconLongitude?: number;
	nriInGroupIconLatitude?: number;
	nriInGroupIconRadio?: number;
}