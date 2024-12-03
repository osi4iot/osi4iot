export interface GroupsManagedDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface IGroupManagedData {
    groupId: number;
    name: string;
    acronym: string;
	orgId: number;
	folderPermission: string;
    telegramInvitationLink: string;
    telegramChatId: string;
    nriInGroupId: number;
    nriInGroupIconLongitude: number;
    nriInGroupIconLatitude: number;
    nriInGroupIconRadio: number;
}

export interface GroupsManagedContextProps {
	groupsManagedOptionToShow: string;
	groupManagedIdToCreateGroupMembers: number;
	groupManagedIdToRemoveAllGroupMembers: number;
	groupManagedRowIndex: number;
	groupManagedIdToEdit: number;
	groupManagedBuildingId: number;
	groupManagedNriId: number;
	groupManagedInputFormData: IGroupManagedData;
}

export interface GroupsManagedActionPayload {
	groupsManagedOptionToShow: string;
	groupManagedIdToCreateGroupMembers: number;
	groupManagedIdToRemoveAllGroupMembers: number;
	groupManagedRowIndex: number;
	groupManagedIdToEdit: number;
	groupManagedBuildingId: number;
	groupManagedNriId: number;
	groupManagedInputFormData: IGroupManagedData;
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

export interface IGroupsManagedIdToEdit {
	groupManagedIdToEdit: number;
}

export interface IGroupsManagedBuildingId {
	groupManagedBuildingId: number;
}

export interface IGroupManagedNriId {
	groupManagedNriId: number;
}


export interface IGroupsManagedInputFormData {
	groupManagedInputFormData: IGroupManagedData;
}

