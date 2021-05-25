export interface GlobalUsersDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface GlobalUsersContextProps {
	globalUsersOptionToShow: string;
	globalUserIdToEdit: number;
	globalUserRowIndexToEdit: number;
}

export interface GlobalUsersActionPayload {
	globalUsersOptionToShow: string;
	globalUserIdToEdit: number;
	globalUserRowIndexToEdit: number;
}

export interface GlobalUsersAction {
	type: string;
	payload: GlobalUsersActionPayload;
	error: string;
}

export interface IGlobalUsersOptionToShow {
	globalUsersOptionToShow: string;
}

export interface IGlobalUserIdToEdit {
	globalUserIdToEdit: number;
}

export interface IGlobalUserRowIndexToEdit {
	globalUserRowIndexToEdit: number;
}



