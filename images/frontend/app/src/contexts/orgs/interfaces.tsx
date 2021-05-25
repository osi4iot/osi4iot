export interface OrgsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface OrgsContextProps {
	orgsOptionToShow: string;
	orgIdToEdit: number;
	orgRowIndexToEdit: number;
}

export interface OrgsActionPayload {
	orgsOptionToShow: string;
	orgIdToEdit: number;
	orgRowIndexToEdit: number;
}

export interface OrgsAction {
	type: string;
	payload: OrgsActionPayload;
	error: string;
}


export interface IOrgsOptionToShow {
	orgsOptionToShow: string;
}

export interface IOrgIdToEdit {
	orgIdToEdit: number;
}

export interface IOrgRowIndexToEdit {
	orgRowIndexToEdit: number;
}
