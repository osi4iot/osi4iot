export interface OrgUsersDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface OrgUsersContextProps {
	orgUsersOptionToShow: string;
	orgUserOrgIdToEdit: number;
	orgUserUserIdToEdit: number;
	orgUserRowIndexToEdit: number;
}

export interface OrgUsersActionPayload {
	orgUsersOptionToShow: string;
	orgUserOrgIdToEdit: number;
	orgUserUserIdToEdit: number;
	orgUserRowIndexToEdit: number;
}

export interface OrgUsersAction {
	type: string;
	payload: OrgUsersActionPayload;
	error: string;
}

export interface IOrgUsersOptionToShow {
	orgUsersOptionToShow: string;
}

export interface IOrgUserOrgIdToEdit {
	orgUserOrgIdToEdit: number;
}

export interface IOrgUserUserIdToEdit {
	orgUserUserIdToEdit: number;
}

export interface IOrgUserRowIndexToEdit {
	orgUserRowIndexToEdit: number;
}




