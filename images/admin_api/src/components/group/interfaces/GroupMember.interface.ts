import { RoleInGroupOption } from "./RoleInGroupOptions";

export default interface IGroupMember {
	userId: number;
	firstName: string;
	surname: string;
	login: string;
	email: string;
	telegramId: string;
	roleInGroup: RoleInGroupOption;
}