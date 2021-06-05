export interface OrgsManagedDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface OrgsManagedContextProps {
	orgsManagedOptionToShow: string;
	orgManagedIdToCreateOrgUsers: number;
	orgManagedIdToRemoveAllOrgUsers: number;
	orgManagedRowIndex: number;
}

export interface OrgsManagedActionPayload {
	orgsManagedOptionToShow: string;
	orgManagedIdToCreateOrgUsers: number;
	orgManagedIdToRemoveAllOrgUsers: number;
	orgManagedRowIndex: number;
}

export interface OrgsManagedAction {
	type: string;
	payload: OrgsManagedActionPayload;
	error: string;
}

export interface IOrgsManagedOptionToShow {
	orgsManagedOptionToShow: string;
}

export interface IOrgManagedIdToCreateOrgUsers {
	orgManagedIdToCreateOrgUsers: number;
}

export interface IOrgManagedIdToRemoveAllOrgUsers {
	orgManagedIdToRemoveAllOrgUsers: number;
}

export interface IOrgsManagedRowIndex {
	orgManagedRowIndex: number;
}




