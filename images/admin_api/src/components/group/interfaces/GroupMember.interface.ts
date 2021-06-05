import { RoleInGroupOption } from "./RoleInGroupOptions";

export default interface IGroupMember {
	groupId: number;
	userId: number;
	firstName: string;
	surname: string;
	email: string;
	roleInGroup: RoleInGroupOption;
}