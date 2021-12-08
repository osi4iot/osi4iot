import { IBuilding } from "../../components/PlatformAssistant/TableColumns/buildingsColumns";
import { IDashboard } from "../../components/PlatformAssistant/TableColumns/dashboardsColumns";
import { IDevice } from "../../components/PlatformAssistant/TableColumns/devicesColumns";
import { IDigitalTwin } from "../../components/PlatformAssistant/TableColumns/digitalTwinsColumns";
import { IFloor } from "../../components/PlatformAssistant/TableColumns/floorsColumns";
import { IGlobalUser } from "../../components/PlatformAssistant/TableColumns/globalUsersColumns";
import { IGroupMember } from "../../components/PlatformAssistant/TableColumns/groupMemberColumns";
import { IGroup } from "../../components/PlatformAssistant/TableColumns/groupsColumns";
import { IGroupManaged } from "../../components/PlatformAssistant/TableColumns/groupsManagedColumns";
import { IMembershipInGroups } from "../../components/PlatformAssistant/TableColumns/membershipInGroups";
import { IMembershipInOrgs } from "../../components/PlatformAssistant/TableColumns/membershipInOrgs";
import { IOrganization } from "../../components/PlatformAssistant/TableColumns/organizationsColumns";
import { IOrgManaged } from "../../components/PlatformAssistant/TableColumns/organizationsManagedColumns";
import { IOrgOfGroupsManaged } from "../../components/PlatformAssistant/TableColumns/orgsOfGroupsManagedColumns";
import { IOrgUser } from "../../components/PlatformAssistant/TableColumns/orgUsersColumns";
import { IRefreshToken } from "../../components/PlatformAssistant/TableColumns/refreshTokensColumns";
import { ISelectOrgUser } from "../../components/PlatformAssistant/TableColumns/selectOrgUsersColumns";
import { ITopic } from "../../components/PlatformAssistant/TableColumns/topicsColumns";
import { IUserProfile } from "../../components/PlatformAssistant/UserProfile";

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
	organizations: IOrganization[];
	buildings: IBuilding[];
	floors: IFloor[];
	globalUsers: IGlobalUser[];
	refreshTokens: IRefreshToken[];
	orgsManaged: IOrgManaged[];
	orgsOfGroupsManaged: IOrgOfGroupsManaged[];
	orgUsers: IOrgUser[];
	groups: IGroup[];
	groupsManaged: IGroupManaged[];
	groupMembers: IGroupMember[];
	devices: IDevice[];
	topics: ITopic[];
	dashboards: IDashboard[];
	digitalTwins: IDigitalTwin[];
	userProfile: IUserProfile;
	orgsMembership: IMembershipInOrgs[];
	groupsMembership: IMembershipInGroups[];
}

export interface PlatformAssistantActionPayload {
	userRole: string;
	numOrganizationManaged: number;
	numGroupsManaged: number; 
	numDevicesManage: number;
	platformAssitantOptionToShow: string;
	selectOrgUsers: ISelectOrgUser[];
	organizations: IOrganization[];
	buildings: IBuilding[];
	floors: IFloor[];
	globalUsers: IGlobalUser[];
	refreshTokens: IRefreshToken[];
	orgsManaged: IOrgManaged[];
	orgsOfGroupsManaged: IOrgOfGroupsManaged[];
	orgUsers: IOrgUser[];
	groups: IGroup[];
	groupsManaged: IGroupManaged[];
	groupMembers: IGroupMember[];
	devices: IDevice[];
	topics: ITopic[];
	dashboards: IDashboard[];
	digitalTwins: IDigitalTwin[];
	userProfile: IUserProfile;
	orgsMembership: IMembershipInOrgs[];
	groupsMembership: IMembershipInGroups[];
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

export interface IOrganizationsTable {
	organizations: IOrganization[];
}

export interface IGlobalUsersTable {
	globalUsers: IGlobalUser[];
}

export interface IBuildingsTable {
	buildings: IBuilding[];
}

export interface IFloorsTable {
	floors: IFloor[];
}

export interface IRefreshTokensTable {
	refreshTokens: IRefreshToken[];
}

export interface IOrgsManagedTable {
	orgsManaged: IOrgManaged[];
}

export interface IOrgsOfGroupsManagedTable {
	orgsOfGroupsManaged: IOrgOfGroupsManaged[];
}

export interface IOrgUsersTable {
	orgUsers: IOrgUser[];
}

export interface IGroupsTable {
	groups: IGroup[];
}

export interface IGroupsManagedTable {
	groupsManaged: IGroupManaged[];
}

export interface IGroupMembersTable {
	groupMembers: IGroupMember[];
}

export interface IDevicesTable {
	devices: IDevice[];
}

export interface IUserProfileTable {
	userProfile: IUserProfile;
}

export interface IOrgsMembershipTable {
	orgsMembership: IMembershipInOrgs[];
}

export interface IGroupsMembershipTable {
	groupsMembership: IMembershipInGroups[];
}

export interface ITopicsTable {
	topics: ITopic[];
}

export interface IDashboardsTable {
	dashboards: IDashboard[];
}

export interface IDigitalTwinsTable {
	digitalTwins: IDigitalTwin[];
}










