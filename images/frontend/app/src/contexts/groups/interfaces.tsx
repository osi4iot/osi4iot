export interface GroupsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface GroupsContextProps {
	groupsOptionToShow: string;
	groupIdToEdit: number;
}

export interface GroupsActionPayload {
	groupsOptionToShow: string;
	groupIdToEdit: number;
}

export interface GroupsAction {
	type: string;
	payload: GroupsActionPayload;
	error: string;
}


export interface IGroupsOptionToShow {
	groupsOptionToShow: string;
}

export interface IGroupIdToEdit {
	groupIdToEdit: number;
}



