import { IBuilding } from "../../components/PlatformAssistant/TableColumns/buildingsColumns";
import { IDashboard } from "../../components/PlatformAssistant/TableColumns/dashboardsColumns";
import { IDevice } from "../../components/PlatformAssistant/TableColumns/devicesColumns";
import { IDigitalTwin } from "../../components/PlatformAssistant/TableColumns/digitalTwinsColumns";
import { IFloor } from "../../components/PlatformAssistant/TableColumns/floorsColumns";
import { IGlobalUser } from "../../components/PlatformAssistant/TableColumns/globalUsersColumns";
import { IGroupMember } from "../../components/PlatformAssistant/TableColumns/groupMemberColumns";
import { IGroup } from "../../components/PlatformAssistant/TableColumns/groupsColumns";
import { IGroupManaged } from "../../components/PlatformAssistant/TableColumns/groupsManagedColumns";
import { INodeRedInstance } from "../../components/PlatformAssistant/TableColumns/nodeRedInstancesInOrgsColumns";
import { IMembershipInGroups } from "../../components/PlatformAssistant/TableColumns/membershipInGroups";
import { IMembershipInOrgs } from "../../components/PlatformAssistant/TableColumns/membershipInOrgs";
import { IOrganization } from "../../components/PlatformAssistant/TableColumns/organizationsColumns";
import { IOrgManaged } from "../../components/PlatformAssistant/TableColumns/organizationsManagedColumns";
import { IOrgOfGroupsManaged } from "../../components/PlatformAssistant/TableColumns/orgsOfGroupsManagedColumns";
import { IOrgUser } from "../../components/PlatformAssistant/TableColumns/orgUsersColumns";
import { IRefreshToken } from "../../components/PlatformAssistant/TableColumns/refreshTokensColumns";
import { ISelectOrgUser } from "../../components/PlatformAssistant/TableColumns/selectOrgUsersColumns";
import { ITopic } from "../../components/PlatformAssistant/TableColumns/topicsColumns";
import { IUserProfile } from "../../components/PlatformAssistant/UserOptions/UserProfile";
import { IMlModel } from "../../components/PlatformAssistant/TableColumns/mlModelsColumns";
import { IAsset } from "../../components/PlatformAssistant/TableColumns/assetsColumns";
import { ISensor } from "../../components/PlatformAssistant/TableColumns/sensorsColumns";

export interface PlatformAssistantDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface PlatformAssistantContextProps {
	userRole: string;
	numOrganizationManaged: number;
	numGroupsManaged: number; 
	numDevicesManage: number;
	platformAssitantOptionToShow: string;
	selectOrgUsers: ISelectOrgUser[];
	reloadSelectOrgUsersTable: boolean;
	organizations: IOrganization[];
	nodeRedInstances: INodeRedInstance[];
	reloadNodeRedInstancesTable: boolean;
	buildings: IBuilding[];
	reloadBuildingsTable: boolean;
	floors: IFloor[];
	reloadFloorsTable: boolean;
	globalUsers: IGlobalUser[];
	reloadGlobalUsersTable: boolean;
	refreshTokens: IRefreshToken[];
	orgsManaged: IOrgManaged[];
	reloadOrgsManagedTable: boolean;
	orgsOfGroupsManaged: IOrgOfGroupsManaged[];
	reloadOrgsOfGroupsManagedTable: boolean;
	orgUsers: IOrgUser[];
	reloadOrgUsersTable: boolean;
	groups: IGroup[];
	reloadGroupsTable: boolean;
	groupsManaged: IGroupManaged[];
	reloadGroupsManagedTable: boolean;
	groupMembers: IGroupMember[];
	reloadGroupMembersTable: boolean;
	assets: IAsset[];
	reloadAssetsTable: boolean;
	sensors: ISensor[];
	reloadSensorsTable: boolean;
	devices: IDevice[];
	reloadDevicesTable: boolean;
	topics: ITopic[];
	reloadTopicsTable: boolean;
	dashboards: IDashboard[];
	reloadDashboardsTable: boolean;
	digitalTwins: IDigitalTwin[];
	reloadDigitalTwinsTable: boolean;
	mlModels: IMlModel[];
	reloadMlModelsTable: boolean;
	userProfile: IUserProfile;
	orgsMembership: IMembershipInOrgs[];
	reloadOrgsMembershipTable: boolean;
	groupsMembership: IMembershipInGroups[];
	reloadGroupsMembershipTable: boolean;
}

export interface PlatformAssistantActionPayload {
	userRole: string;
	numOrganizationManaged: number;
	numGroupsManaged: number; 
	numDevicesManage: number;
	platformAssitantOptionToShow: string;
	selectOrgUsers: ISelectOrgUser[];
	reloadSelectOrgUsersTable: boolean;
	organizations: IOrganization[];
	nodeRedInstances: INodeRedInstance[];
	reloadNodeRedInstancesTable: boolean;
	buildings: IBuilding[];
	reloadBuildingsTable: boolean;
	floors: IFloor[];
	reloadFloorsTable: boolean;
	globalUsers: IGlobalUser[];
	reloadGlobalUsersTable: boolean;
	refreshTokens: IRefreshToken[];
	orgsManaged: IOrgManaged[];
	reloadOrgsManagedTable: boolean;
	orgsOfGroupsManaged: IOrgOfGroupsManaged[];
	reloadOrgsOfGroupsManagedTable: boolean;
	orgUsers: IOrgUser[];
	reloadOrgUsersTable: boolean;
	groups: IGroup[];
	reloadGroupsTable: boolean;
	groupsManaged: IGroupManaged[];
	reloadGroupsManagedTable: boolean;
	groupMembers: IGroupMember[];
	reloadGroupMembersTable: boolean;
	assets: IAsset[];
	reloadAssetsTable: boolean;
	sensors: ISensor[];
	reloadSensorsTable: boolean;
	devices: IDevice[];
	reloadDevicesTable: boolean;
	topics: ITopic[];
	reloadTopicsTable: boolean;
	dashboards: IDashboard[];
	reloadDashboardsTable: boolean;
	digitalTwins: IDigitalTwin[];
	reloadDigitalTwinsTable: boolean;
	mlModels: IMlModel[];
	reloadMlModelsTable: boolean;
	userProfile: IUserProfile;
	orgsMembership: IMembershipInOrgs[];
	reloadOrgsMembershipTable: boolean;
	groupsMembership: IMembershipInGroups[];
	reloadGroupsMembershipTable: boolean;
}

export interface PlatformAssistantAction {
	type: string;
	payload: PlatformAssistantActionPayload;
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

export interface ISelectOrgUsersTable {
	selectOrgUsers: ISelectOrgUser[];
}

export interface IReloadSelectOrgUsersTable {
	reloadSelectOrgUsersTable: boolean;
}

export interface IOrganizationsTable {
	organizations: IOrganization[];
}

export interface INodeRedInstancesTable {
	nodeRedInstances: INodeRedInstance[];
}

export interface IReloadNodeRedInstancesTable {
	reloadNodeRedInstancesTable: boolean;
}

export interface IGlobalUsersTable {
	globalUsers: IGlobalUser[];
}

export interface IReloadGlobalUsersTable {
	reloadGlobalUsersTable: boolean;
}

export interface IBuildingsTable {
	buildings: IBuilding[];
}

export interface IReloadBuildingsTable {
	reloadBuildingsTable: boolean;
}

export interface IFloorsTable {
	floors: IFloor[];
}

export interface IReloadFloorsTable {
	reloadFloorsTable: boolean;
}

export interface IRefreshTokensTable {
	refreshTokens: IRefreshToken[];
}

export interface IOrgsManagedTable {
	orgsManaged: IOrgManaged[];
}

export interface IReloadOrgsManagedTable {
	reloadOrgsManagedTable: boolean;
}

export interface IOrgsOfGroupsManagedTable {
	orgsOfGroupsManaged: IOrgOfGroupsManaged[];
}

export interface IReloadOrgsOfGroupsManagedTable {
	reloadOrgsOfGroupsManagedTable: boolean;
}

export interface IOrgUsersTable {
	orgUsers: IOrgUser[];
}

export interface IReloadOrgUsersTable {
	reloadOrgUsersTable: boolean;
}

export interface IGroupsTable {
	groups: IGroup[];
}

export interface IReloadGroupsTable {
	reloadGroupsTable: boolean;
}

export interface IGroupsManagedTable {
	groupsManaged: IGroupManaged[];
}

export interface IReloadGroupsManagedTable {
	reloadGroupsManagedTable: boolean;
}

export interface IGroupMembersTable {
	groupMembers: IGroupMember[];
}

export interface IReloadGroupMembersTable {
	reloadGroupMembersTable: boolean;
}

export interface IAssetsTable {
	assets: IAsset[];
}

export interface IReloadAssetsTable {
	reloadAssetsTable: boolean;
}

export interface ISensorsTable {
	sensors: ISensor[];
}

export interface IReloadSensorsTable {
	reloadSensorsTable: boolean;
}

export interface IDevicesTable {
	devices: IDevice[];
}

export interface IReloadDevicesTable {
	reloadDevicesTable: boolean;
}

export interface IUserProfileTable {
	userProfile: IUserProfile;
}

export interface IOrgsMembershipTable {
	orgsMembership: IMembershipInOrgs[];
}

export interface IRealoadOrgsMembershipTable {
	reloadOrgsMembershipTable: boolean; 
}

export interface IGroupsMembershipTable {
	groupsMembership: IMembershipInGroups[];
}

export interface IReloadGroupsMembershipTable {
	reloadGroupsMembershipTable: boolean;
}

export interface ITopicsTable {
	topics: ITopic[];
}

export interface IReloadTopicsTable {
	reloadTopicsTable: boolean;
}


export interface IDashboardsTable {
	dashboards: IDashboard[];
}

export interface IReloadDashboardsTable {
	reloadDashboardsTable: boolean;
}

export interface IDigitalTwinsTable {
	digitalTwins: IDigitalTwin[];
}

export interface IReloadDigitalTwinsTable {
	reloadDigitalTwinsTable: boolean;
}

export interface IMlModelsTable {
	mlModels: IMlModel[];
}

export interface IReloadMlModelsTable {
	reloadMlModelsTable: boolean;
}











