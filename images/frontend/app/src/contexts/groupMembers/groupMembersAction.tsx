import {
	GroupMembersDispatch,
	IGroupMembersOptionToShow,
	IGroupMemberGroupIdToEdit,
	IGroupMemberUserIdToEdit,
	IGroupMemberRowIndexToEdit
} from "./interfaces";


export function setGroupMembersOptionToShow(groupMembersDispatch: GroupMembersDispatch, data: IGroupMembersOptionToShow) {
	groupMembersDispatch({ type: "GROUP_MEMBERS_OPTION_TO_SHOW", payload: data });
}

export function setGroupMemberGroupIdToEdit(groupMembersDispatch: GroupMembersDispatch, data: IGroupMemberGroupIdToEdit) {
	groupMembersDispatch({ type: "GROUP_MEMBER_GROUP_ID_TO_EDIT", payload: data });
}

export function setGroupMemberUserIdToEdit(groupMembersDispatch: GroupMembersDispatch, data: IGroupMemberUserIdToEdit) {
	groupMembersDispatch({ type: "GROUP_MEMBER_USER_ID_TO_EDIT", payload: data });
}

export function setGroupMemberRowIndexToEdit(groupMembersDispatch: GroupMembersDispatch, data: IGroupMemberRowIndexToEdit) {
	groupMembersDispatch({ type: "GROUP_MEMBER_ROW_INDEX_TO_EDIT", payload: data });
}
