import {
	OrgUsersDispatch,
	IOrgUserOrgIdToEdit,
	IOrgUserUserIdToEdit,
	IOrgUsersOptionToShow,
	IOrgUserRowIndexToEdit
} from "./interfaces";


export function setOrgUsersOptionToShow(orgUsersDispatch: OrgUsersDispatch, data: IOrgUsersOptionToShow) {
	orgUsersDispatch({ type: "ORG_USERS_OPTION_TO_SHOW", payload: data });
}

export function setOrgUserOrgIdToEdit(orgUsersDispatch: OrgUsersDispatch, data: IOrgUserOrgIdToEdit) {
	orgUsersDispatch({ type: "ORG_USER_ORG_ID_TO_EDIT", payload: data });
}

export function setOrgUserUserIdToEdit(orgUsersDispatch: OrgUsersDispatch, data: IOrgUserUserIdToEdit) {
	orgUsersDispatch({ type: "ORG_USER_USER_ID_TO_EDIT", payload: data });
}

export function setOrgUserRowIndexToEdit(orgUsersDispatch: OrgUsersDispatch, data: IOrgUserRowIndexToEdit) {
	orgUsersDispatch({ type: "ORG_USER_ROW_INDEX_TO_EDIT", payload: data });
}


