import {
	GlobalUsersDispatch,
	IGlobalUsersOptionToShow,
	IGlobalUserIdToEdit,
	IGlobalUserRowIndexToEdit
} from "./interfaces";

export function setGlobalUsersOptionToShow(globalUsersDispatch: GlobalUsersDispatch, data: IGlobalUsersOptionToShow) {
	globalUsersDispatch({ type: "GLOBAL_USER_OPTION_TO_SHOW", payload: data });
}

export function setGlobalUserIdToEdit(globalUsersDispatch: GlobalUsersDispatch, data: IGlobalUserIdToEdit) {
	globalUsersDispatch({ type: "GLOBAL_USER_ID_TO_EDIT", payload: data });
}

export function setGlobalUserRowIndexToEdit(globalUsersDispatch: GlobalUsersDispatch, data: IGlobalUserRowIndexToEdit) {
	globalUsersDispatch({ type: "GLOBAL_USER_ROW_INDEX_TO_EDIT", payload: data });
}

