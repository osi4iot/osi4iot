import { RoleInGroupOption } from "./RoleInGroupOptions";

export default interface IMembershipInGroups {
	groupId: number;
	orgId: number;
	name: string;
	acronym: string;
	telegramInvitationLink: string;
	telegramChatId: string;
	roleInGroup:  RoleInGroupOption;
}