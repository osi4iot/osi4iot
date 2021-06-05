import {
	GroupsDispatch,
	IGroupsOptionToShow,
	IGroupIdToEdit,
	IGroupRowToEdit,
} from "./interfaces";

export function setGroupsOptionToShow(groupsDispatch: GroupsDispatch, data: IGroupsOptionToShow) {
	groupsDispatch({ type: "GROUPS_OPTION_TO_SHOW", payload: data });
}

export function setGroupIdToEdit(groupsDispatch: GroupsDispatch, data: IGroupIdToEdit) {
	groupsDispatch({ type: "GROUP_ID_TO_EDIT", payload: data });
}

export function setGroupRowIndexToEdit(groupsDispatch: GroupsDispatch, data: IGroupRowToEdit) {
	groupsDispatch({ type: "GROUP_ROW_INDEX_TO_EDIT", payload: data });
}
