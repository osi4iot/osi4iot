import {
	PlatformAssistantDispatch,
	IUserRole,
	IPlatformAssistantOptionToShow,
	ISelectOrgUsersTable,
	IOrganizationsTable,
	IGlobalUsersTable,
	IBuildingsTable,
	IFloorsTable,
	IRefreshTokensTable,
	IOrgsManagedTable,
	IOrgsOfGroupsManagedTable,
	IGroupsTable,
	IOrgUsersTable,
	IGroupMembersTable,
	IGroupsManagedTable,
	IGroupsMembershipTable,
	IOrgsMembershipTable,
	IUserProfileTable,
	ITopicsTable,
	IDashboardsTable,
	IDigitalTwinsTable,
	IReloadGroupsManagedTable,
	IReloadOrgsManagedTable,
	IReloadSelectOrgUsersTable,
	IReloadGroupMembersTable,
	IRealoadOrgsMembershipTable,
	IReloadGroupsMembershipTable,
	IReloadGroupsTable,
	IReloadOrgUsersTable,
	IReloadTopicsTable,
	IReloadDashboardsTable,
	IReloadDigitalTwinsTable,
	IReloadOrgsOfGroupsManagedTable,
	IReloadGlobalUsersTable,
	IReloadBuildingsTable,
	IReloadFloorsTable,
	INodeRedInstancesTable,
	IReloadNodeRedInstancesTable,
	IMlModelsTable,
	IReloadMlModelsTable,
	IAssetsTable,
	IReloadAssetsTable,
	ISensorsTable,
	IReloadSensorsTable,
	IWindowObjectReferences,
	IAssetTypesTable,
	IReloadAssetTypesTable,
	IAssetS3FoldersTable,
	IReloadAssetS3FoldersTable,
	ISensorTypesTable,
	IReloadSensorTypesTable,
	IAssetTopicsTable,
	IReloadAssetTopicsTable,
	IAssetsWithMarkerTable,
	IReloadAssetsWithMarkerTable

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

export function setReloadSelectOrgUsersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadSelectOrgUsersTable) {
	plaformAssistantDispatch({ type: 'RELOAD_SELECT_ORG_USERS_TABLE', payload: data });
}

export function setOrganizationsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrganizationsTable) {
	plaformAssistantDispatch({ type: 'ORGANIZATIONS_TABLE', payload: data });
}

export function setNodeRedInstancesTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: INodeRedInstancesTable) {
	plaformAssistantDispatch({ type: 'NODERED_INSTANCES_TABLE', payload: data });
}

export function setReloadNodeRedInstancesTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadNodeRedInstancesTable) {
	plaformAssistantDispatch({ type: 'RELOAD_NODERED_INSTANCES_TABLE', payload: data });
}

export function setBuildingsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IBuildingsTable) {
	plaformAssistantDispatch({ type: 'BUILDINGS_TABLE', payload: data });
}

export function setReloadBuildingsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadBuildingsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_BUILDINGS_TABLE', payload: data });
}

export function setFloorsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IFloorsTable) {
	plaformAssistantDispatch({ type: 'FLOORS_TABLE', payload: data });
}

export function setReloadFloorsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadFloorsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_FLOORS_TABLE', payload: data });
}


export function setGlobalUsersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGlobalUsersTable) {
	plaformAssistantDispatch({ type: 'GLOBAL_USERS_TABLE', payload: data });
}

export function setReloadGlobalUsersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadGlobalUsersTable) {
	plaformAssistantDispatch({ type: 'RELOAD_GLOBAL_USERS_TABLE', payload: data });
}

export function setRefreshTokensTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IRefreshTokensTable) {
	plaformAssistantDispatch({ type: 'REFRESH_TOKENS_TABLE', payload: data });
}


export function setOrgsManagedTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrgsManagedTable) {
	plaformAssistantDispatch({ type: 'ORGS_MANAGED_TABLE', payload: data });
}

export function setReloadOrgsManagedTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadOrgsManagedTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ORGS_MANAGED_TABLE', payload: data });
}

export function setOrgsOfGroupsManagedTable(
	plaformAssistantDispatch: PlatformAssistantDispatch,
	data: IOrgsOfGroupsManagedTable
) {
	plaformAssistantDispatch({ type: 'ORGS_OF_GROUPS_MANAGED_TABLE', payload: data });
}

export function setReloadOrgsOfGroupsManagedTable(
	plaformAssistantDispatch: PlatformAssistantDispatch,
	data: IReloadOrgsOfGroupsManagedTable
) {
	plaformAssistantDispatch({ type: 'RELOAD_ORGS_OF_GROUPS_MANAGED_TABLE', payload: data });
}

export function setOrgUsersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrgUsersTable) {
	plaformAssistantDispatch({ type: 'ORGS_USERS_TABLE', payload: data });
}

export function setReloadOrgUsersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadOrgUsersTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ORGS_USERS_TABLE', payload: data });
}

export function setGroupsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGroupsTable) {
	plaformAssistantDispatch({ type: 'GROUPS_TABLE', payload: data });
}

export function setReloadGroupsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadGroupsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_GROUPS_TABLE', payload: data });
}

export function setGroupsManagedTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGroupsManagedTable) {
	plaformAssistantDispatch({ type: 'GROUPS_MANAGED_TABLE', payload: data });
}

export function setReloadGroupsManagedTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadGroupsManagedTable) {
	plaformAssistantDispatch({ type: 'RELOAD_GROUPS_MANAGED_TABLE', payload: data });
}

export function setGroupMembersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGroupMembersTable) {
	plaformAssistantDispatch({ type: 'GROUPS_MEMBERS_TABLE', payload: data });
}

export function setReloadGroupMembersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadGroupMembersTable) {
	plaformAssistantDispatch({ type: 'RELOAD_GROUPS_MEMBERS_TABLE', payload: data });
}

export function setAssetTypesTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IAssetTypesTable) {
	plaformAssistantDispatch({ type: 'ASSET_TYPES_TABLE', payload: data });
}

export function setReloadAssetTypesTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadAssetTypesTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ASSET_TYPES_TABLE', payload: data });
}

export function setAssetsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IAssetsTable) {
	plaformAssistantDispatch({ type: 'ASSETS_TABLE', payload: data });
}

export function setReloadAssetsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadAssetsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ASSETS_TABLE', payload: data });
}

export function setAssetsWithMarkerTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IAssetsWithMarkerTable) {
	plaformAssistantDispatch({ type: 'ASSETS_WITH_MARKER_TABLE', payload: data });
}

export function setReloadAssetsWithMarkerTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadAssetsWithMarkerTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ASSETS_WITH_MARKER_TABLE', payload: data });
}

export function setAssetTopicsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IAssetTopicsTable) {
	plaformAssistantDispatch({ type: 'ASSET_TOPICS_TABLE', payload: data });
}

export function setReloadAssetTopicsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadAssetTopicsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ASSET_TOPICS_TABLE', payload: data });
}

export function setAssetS3FoldersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IAssetS3FoldersTable) {
	plaformAssistantDispatch({ type: 'ASSET_S3_FOLDERS_TABLE', payload: data });
}

export function setReloadAssetS3FoldersTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadAssetS3FoldersTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ASSET_S3_FOLDERS_TABLE', payload: data });
}

export function setSensorTypesTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: ISensorTypesTable) {
	plaformAssistantDispatch({ type: 'SENSOR_TYPES_TABLE', payload: data });
}

export function setReloadSensorTypesTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadSensorTypesTable) {
	plaformAssistantDispatch({ type: 'RELOAD_SENSOR_TYPES_TABLE', payload: data });
}

export function setSensorsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: ISensorsTable) {
	plaformAssistantDispatch({ type: 'SENSORS_TABLE', payload: data });
}

export function setReloadSensorsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadSensorsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_SENSORS_TABLE', payload: data });
}

export function setTopicsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: ITopicsTable) {
	plaformAssistantDispatch({ type: 'TOPICS_TABLE', payload: data });
}

export function setReloadTopicsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadTopicsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_TOPICS_TABLE', payload: data });
}

export function setDashboardsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IDashboardsTable) {
	plaformAssistantDispatch({ type: 'DASHBOARDS_TABLE', payload: data });
}

export function setReloadDashboardsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadDashboardsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_DASHBOARDS_TABLE', payload: data });
}

export function setDigitalTwinsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IDigitalTwinsTable) {
	plaformAssistantDispatch({ type: 'DIGITAL_TWIN_TABLE', payload: data });
}

export function setReloadDigitalTwinsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadDigitalTwinsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_DIGITAL_TWIN_TABLE', payload: data });
}

export function setMlModelsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IMlModelsTable) {
	plaformAssistantDispatch({ type: 'ML_MODEL_TABLE', payload: data });
}

export function setReloadMlModelsTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadMlModelsTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ML_MODEL_TABLE', payload: data });
}

export function setUserProfileTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IUserProfileTable) {
	plaformAssistantDispatch({ type: 'USER_PROFILE_TABLE', payload: data });
}

export function setOrgsMembershipTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IOrgsMembershipTable) {
	plaformAssistantDispatch({ type: 'ORGS_MEMBERSHIP_TABLE', payload: data });
}

export function setReloadOrgsMembershipTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IRealoadOrgsMembershipTable) {
	plaformAssistantDispatch({ type: 'RELOAD_ORGS_MEMBERSHIP_TABLE', payload: data });
}

export function setGroupsMembershipTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IGroupsMembershipTable) {
	plaformAssistantDispatch({ type: 'GROUP_MEMBERSHIP_TABLE', payload: data });
}

export function setReloadGroupsMembershipTable(plaformAssistantDispatch: PlatformAssistantDispatch, data: IReloadGroupsMembershipTable) {
	plaformAssistantDispatch({ type: 'RELOAD_GROUP_MEMBERSHIP_TABLE', payload: data });
}

export function setResetTables(plaformAssistantDispatch: PlatformAssistantDispatch) {
	plaformAssistantDispatch({ type: 'RESET_TABLES' });
}

export function setWindowObjectReferences(plaformAssistantDispatch: PlatformAssistantDispatch, data: IWindowObjectReferences) {
	plaformAssistantDispatch({ type: 'WINDOWS_OBJECT_REFERENCES', payload: data });
}






