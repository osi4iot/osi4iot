export interface DevicesDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface DevicesContextProps {
	devicesOptionToShow: string;
	deviceIdToEdit: number;
}

export interface DevicesActionPayload {
	devicesOptionToShow: string;
	deviceIdToEdit: number;
}

export interface DevicesAction {
	type: string;
	payload: DevicesActionPayload;
	error: string;
}

export interface IUserRole {
	userRole: string;
	numOrganizationManaged: number;
	numGroupsManaged: number;
	numDevicesManaged: number;
}

export interface IPlatformAssistantOptionToShow {
	platformAssistantOptionToShow: string;
}


export interface IDevicesOptionToShow {
	devicesOptionToShow: string;
}

export interface IDeviceIdToEdit {
	deviceIdToEdit: number;
}

export interface IGroupMembersOptionToShow {
	groupMembersOptionToShow: string;
}

export interface IGroupMemberIdToEdit {
	groupMemberIdToEdit: number;
}


export interface IUserProfileOptionToShow {
	userProfileOptionToShow: string;
}

export interface IHomeOptionToShow {
	homeOptionToShow: string;
}



