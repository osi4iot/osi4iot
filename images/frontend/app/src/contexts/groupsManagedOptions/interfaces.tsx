export interface GroupsManagedDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface GroupsManagedContextProps {
	groupsManagedOptionToShow: string;
	groupManagedIdToCreateGroupMembers: number;
	groupManagedIdToRemoveAllGroupMembers: number;
	groupManagedRowIndex: number;
}

export interface GroupsManagedActionPayload {
	groupsManagedOptionToShow: string;
	groupManagedIdToCreateGroupMembers: number;
	groupManagedIdToRemoveAllGroupMembers: number;
	groupManagedRowIndex: number;
}

export interface GroupsManagedAction {
	type: string;
	payload: GroupsManagedActionPayload;
	error: string;
}

export interface IGroupsManagedOptionToShow {
	groupsManagedOptionToShow: string;
}

export interface IGroupManagedIdToCreateGroupMembers {
	groupManagedIdToCreateGroupMembers: number;
}

export interface IGroupManagedIdToRemoveAllGroupMembers{
	groupManagedIdToRemoveAllGroupMembers: number;
}

export interface IGroupManagedRowIndex {
	groupManagedRowIndex: number;
}




