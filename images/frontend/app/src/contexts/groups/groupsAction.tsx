import {
	GroupsDispatch,
	IGroupsOptionToShow,
	IGroupIdToEdit,
} from "./interfaces";

export function setGroupsOptionToShow(groupsDispatch: GroupsDispatch, data: IGroupsOptionToShow) {
	groupsDispatch({ type: "GROUPS_OPTION_TO_SHOW", payload: data });
}

export function setGroupIdToEdit(groupsDispatch: GroupsDispatch, data: IGroupIdToEdit) {
	groupsDispatch({ type: "GROUP_ID_TO_EDIT", payload: data });
}
