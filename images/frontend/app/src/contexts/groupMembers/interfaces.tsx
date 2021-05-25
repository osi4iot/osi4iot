export interface GroupMembersDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface GroupMembersContextProps {
	groupMembersOptionToShow: string;
	groupMemberGroupIdToEdit: number;
	groupMemberUserIdToEdit: number;
	groupMemberRowIndexToEdit: number;
}

export interface GroupMembersActionPayload {
	groupMembersOptionToShow: string;
	groupMemberGroupIdToEdit: number;
	groupMemberUserIdToEdit: number;
	groupMemberRowIndexToEdit: number;
}

export interface GroupMembersAction {
	type: string;
	payload: GroupMembersActionPayload;
	error: string;
}


export interface IGroupMembersOptionToShow {
	groupMembersOptionToShow: string;
}

export interface IGroupMemberGroupIdToEdit {
	groupMemberGroupIdToEdit: number;
}

export interface IGroupMemberUserIdToEdit {
	groupMemberUserIdToEdit: number;
}

export interface IGroupMemberRowIndexToEdit {
	groupMemberRowIndexToEdit: number;
}




