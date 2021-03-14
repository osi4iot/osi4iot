export default interface IGroup {
	id?: number;
	orgId: number;
	teamId: number;
	folderId: number;
	folderUid: string;
	name: string;
	acronym: string;
	groupUid: string;
	telegramInvitationLink?: string;
	telegramChatId?: string;
	isPrivate: boolean;
}