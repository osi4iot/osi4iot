import {
	PlatformAssistantDispatch,
	IUserRole,
	IPlatformAssistantOptionToShow,
	ISelectOrgUsersTable,
	IOrganizationsTable,
	IGlobalUsersTable,
	IRefreshTokensTable,
	IOrgsManagedTable,
	IOrgsOfGroupsManagedTable,
	IGroupsTable,
	IOrgUsersTable,
	IDevicesTable,
	IGroupMembersTable,
	IGroupsManagedTable,
	IGroupsMembershipTable,
	IOrgsMembershipTable,
	IUserProfileTable,
	ITopicsTable,
	IDigitalTwinsTable

} from "./interfaces";

export function setUserRole(plaformAssistantDispatch: PlatformAssistantDispatch, data: IUserRole) {
	plaformAssistantDispatch({ type: 'USER_ROLE', payload: data });
}

export function setPlaformAssistantOptionToShow(plaformAssistantDispatch: PlatformAssistantDispatch, data: IPlatformAssistantOptionToShow) {
	plaformAssistantDispatch({ type: 'PLATFORM_ASSISTANT_OPTION_TO_SHOW', payload: data });
}

export function setSelectOrgUsersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: ISelectOrgUsersTable) {
	plaformAssistantDispatch({ type: 'SELECT_ORG_USERS_TABLE', payload: data });
}

export function setOrganizationsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrganizationsTable) {
	plaformAssistantDispatch({ type: 'ORGANIZATIONS_TABLE', payload: data });
}

export function setGlobalUsersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGlobalUsersTable) {
	plaformAssistantDispatch({ type: 'GLOBAL_USERS_TABLE', payload: data });
}

export function setRefreshTokensTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IRefreshTokensTable) {
	plaformAssistantDispatch({ type: 'REFRESH_TOKENS_TABLE', payload: data });
}


export function setOrgsManagedTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrgsManagedTable) {
	plaformAssistantDispatch({ type: 'ORGS_MANAGED_TABLE', payload: data });
}

export function setOrgsOfGroupsManagedTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrgsOfGroupsManagedTable) {
	plaformAssistantDispatch({ type: 'ORGS_OF_GROUPS_MANAGED_TABLE', payload: data });
}

export function setOrgUsersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrgUsersTable) {
	plaformAssistantDispatch({ type: 'ORGS_USERS_TABLE', payload: data });
}


export function setGroupsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGroupsTable) {
	plaformAssistantDispatch({ type: 'GROUPS_TABLE', payload: data });
}


export function setGroupsManagedTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGroupsManagedTable) {
	plaformAssistantDispatch({ type: 'GROUPS_MANAGED_TABLE', payload: data });
}

export function setGroupMembersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGroupMembersTable) {
	plaformAssistantDispatch({ type: 'GROUPS_MEMBERS_TABLE', payload: data });
}


export function setDevicesTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IDevicesTable) {
	plaformAssistantDispatch({ type: 'DEVICES_TABLE', payload: data });
}

export function setTopicsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: ITopicsTable) {
	plaformAssistantDispatch({ type: 'TOPICS_TABLE', payload: data });
}

export function setDigitalTwinsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IDigitalTwinsTable) {
	plaformAssistantDispatch({ type: 'DIGITAL_TWIN_TABLE', payload: data });
}

export function setUserProfileTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IUserProfileTable) {
	plaformAssistantDispatch({ type: 'USER_PROFILE_TABLE', payload: data });
}

export function setOrgsMembershipTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrgsMembershipTable) {
	plaformAssistantDispatch({ type: 'ORGS_MEMBERSHIP_TABLE', payload: data });
}

export function setGroupsMembershipTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGroupsMembershipTable) {
	plaformAssistantDispatch({ type: 'GROUP_MEMBERSHIP_TABLE', payload: data });
}





