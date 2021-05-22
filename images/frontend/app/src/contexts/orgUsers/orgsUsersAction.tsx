import {
	OrgUsersDispatch,
	IOrgUserOrgIdToEdit,
	IOrgUserUserIdToEdit,
	IOrgUsersOptionToShow
} from "./interfaces";


export function setOrgUsersOptionToShow(orgUserstDispatch: OrgUsersDispatch, data: IOrgUsersOptionToShow) {
	orgUserstDispatch({ type: "ORG_USERS_OPTION_TO_SHOW", payload: data });
}

export function setOrgUserOrgIdToEdit(orgUserstDispatch: OrgUsersDispatch, data: IOrgUserOrgIdToEdit) {
	orgUserstDispatch({ type: "ORG_USER_ORG_ID_TO_EDIT", payload: data });
}

export function setOrgUserUserIdToEdit(orgUserstDispatch: OrgUsersDispatch, data: IOrgUserUserIdToEdit) {
	orgUserstDispatch({ type: "ORG_USER_USER_ID_TO_EDIT", payload: data });
}

