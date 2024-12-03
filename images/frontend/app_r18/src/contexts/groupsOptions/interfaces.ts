export interface GroupsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface IGroupAdminData {
    firstName: string;
    surname: string;
    email: string;
}

export interface IGroupInputData {
	orgId?: number;
	orgAcronym?: string;
    name: string;
    acronym: string;
    folderPermission: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    floorNumber: number;
	featureIndex: number;
	mqttAccessControl: string;
    groupAdminDataArray?: IGroupAdminData[];
}

export interface IGroupInputFormData {
	groupInputFormData: IGroupInputData;
}

export interface GroupsContextProps {
	groupsOptionToShow: string;
	groupsPreviousOption: string;
	groupIdToEdit: number;
	groupRowIndexToEdit: number;
	groupBuildingId: number;
	groupInputFormData: IGroupInputData;
}

export interface GroupsActionPayload {
	groupsOptionToShow: string;
	groupsPreviousOption: string;
	groupIdToEdit: number;
	groupRowIndexToEdit: number;
	groupBuildingId: number;
	groupInputFormData: IGroupInputData;	
}

export interface GroupsAction {
	type: string;
	payload: GroupsActionPayload;
	error: string;
}

export interface IGroupsOptionToShow {
	groupsOptionToShow: string;
}

export interface IGroupsPreviousOption {
	groupsPreviousOption: string;
}

export interface IGroupIdToEdit {
	groupIdToEdit: number;
}

export interface IGroupRowToEdit {
	groupRowIndexToEdit: number;
}

export interface IGroupBuildingId {
	groupBuildingId: number;
}




