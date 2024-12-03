import {
	GroupsDispatch,
	IGroupsOptionToShow,
	IGroupIdToEdit,
	IGroupRowToEdit,
	IGroupBuildingId,
	IGroupInputFormData,
	IGroupsPreviousOption
} from "./interfaces";

export function setGroupsOptionToShow(groupsDispatch: GroupsDispatch, data: IGroupsOptionToShow) {
	groupsDispatch({ type: "GROUPS_OPTION_TO_SHOW", payload: data });
}

export function setGroupsPreviousOption(groupsDispatch: GroupsDispatch, data: IGroupsPreviousOption) {
	groupsDispatch({ type: "GROUPS_PREVIOUS_OPTION", payload: data });
}

export function setGroupIdToEdit(groupsDispatch: GroupsDispatch, data: IGroupIdToEdit) {
	groupsDispatch({ type: "GROUP_ID_TO_EDIT", payload: data });
}

export function setGroupRowIndexToEdit(groupsDispatch: GroupsDispatch, data: IGroupRowToEdit) {
	groupsDispatch({ type: "GROUP_ROW_INDEX_TO_EDIT", payload: data });
}

export function setGroupBuildingId(groupsDispatch: GroupsDispatch, data: IGroupBuildingId) {
	groupsDispatch({ type: "GROUP_BUILDING_ID", payload: data });
}

export function setGroupInputData(groupsDispatch: GroupsDispatch, data: IGroupInputFormData) {
	groupsDispatch({ type: "GROUP_INPUT_DATA", payload: data });
}
