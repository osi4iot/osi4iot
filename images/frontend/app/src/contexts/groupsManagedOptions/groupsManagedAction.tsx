import {
	GroupsManagedDispatch,
	IGroupsManagedOptionToShow,
	IGroupManagedIdToCreateGroupMembers,
	IGroupManagedIdToRemoveAllGroupMembers,
	IGroupManagedRowIndex
} from "./interfaces";


export function setGroupsManagedOptionToShow(groupsManagedDispatch: GroupsManagedDispatch, data: IGroupsManagedOptionToShow) {
	groupsManagedDispatch({ type: "GROUPS_MANAGED_OPTION_TO_SHOW", payload: data });
}

export function setGroupManagedIdToCreateGroupMembers(groupsManagedDispatch: GroupsManagedDispatch, data: IGroupManagedIdToCreateGroupMembers) {
	groupsManagedDispatch({ type: "GROUP_MANAGED_ID_TO_CREATE_GROUP_MEMBERS", payload: data });
}

export function setGroupManagedIdToRemoveAllGroupMembers(groupsManagedDispatch: GroupsManagedDispatch, data: IGroupManagedIdToRemoveAllGroupMembers) {
	groupsManagedDispatch({ type: "GROUP_MANAGED_ID_TO_REMOVE_ALL_GROUP_MEMBERS", payload: data });
}

export function setGroupManagedRowIndex(groupsManagedDispatch: GroupsManagedDispatch, data: IGroupManagedRowIndex) {
	groupsManagedDispatch({ type: "GROUP_MANAGED_ROW_INDEX", payload: data });
}


