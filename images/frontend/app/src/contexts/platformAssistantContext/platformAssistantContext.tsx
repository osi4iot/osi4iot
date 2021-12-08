import React, { createContext, FC, useContext, useReducer } from 'react';
import { IBuilding } from '../../components/PlatformAssistant/TableColumns/buildingsColumns';
import { IDashboard } from '../../components/PlatformAssistant/TableColumns/dashboardsColumns';
import { IDevice } from '../../components/PlatformAssistant/TableColumns/devicesColumns';
import { IDigitalTwin } from '../../components/PlatformAssistant/TableColumns/digitalTwinsColumns';
import { IFloor } from '../../components/PlatformAssistant/TableColumns/floorsColumns';
import { IGlobalUser } from '../../components/PlatformAssistant/TableColumns/globalUsersColumns';
import { IGroupMember } from '../../components/PlatformAssistant/TableColumns/groupMemberColumns';
import { IGroup } from '../../components/PlatformAssistant/TableColumns/groupsColumns';
import { IGroupManaged } from '../../components/PlatformAssistant/TableColumns/groupsManagedColumns';
import { IMembershipInGroups } from '../../components/PlatformAssistant/TableColumns/membershipInGroups';
import { IMembershipInOrgs } from '../../components/PlatformAssistant/TableColumns/membershipInOrgs';
import { IOrganization } from '../../components/PlatformAssistant/TableColumns/organizationsColumns';
import { IOrgManaged } from '../../components/PlatformAssistant/TableColumns/organizationsManagedColumns';
import { IOrgOfGroupsManaged } from '../../components/PlatformAssistant/TableColumns/orgsOfGroupsManagedColumns';
import { IOrgUser } from '../../components/PlatformAssistant/TableColumns/orgUsersColumns';
import { IRefreshToken } from '../../components/PlatformAssistant/TableColumns/refreshTokensColumns';
import { ISelectOrgUser } from '../../components/PlatformAssistant/TableColumns/selectOrgUsersColumns';
import { ITopic } from '../../components/PlatformAssistant/TableColumns/topicsColumns';
import { IUserProfile } from '../../components/PlatformAssistant/UserProfile';
import { ChildrenProp } from '../../interfaces/interfaces'
import { PlatformAssistantContextProps } from './interfaces'
import { initialState, PlatformAssitantReducer } from './platformAssistantReducer';


const PlatformAssitantStateContext = createContext<PlatformAssistantContextProps>(initialState);
const PlatformAssitantDispatchContext = createContext<any>({});

export function usePlatformAssitantState() {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantState must be used within a PlatformAssitantProvider');
	}
	return context;
}

export const useIsPlatformAdmin = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useIsPlatformAdmin must be used within a PlatformAssitantProvider');
	}
	return context.userRole === "PlatformAdmin";
}

export const useIsOrgAdmin = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useIsOrgAdmin must be used within a PlatformAssitantProvider');
	}
	return context.userRole === "OrgAdmin";
}

export const useIsGroupAdmin = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useIsGroupAdmin must be used within a PlatformAssitantProvider');
	}
	return context.userRole === "GroupAdmin";
}

export const useUserRole = (): string => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useIsPlatformAdmin must be used within a PlatformAssitantProvider');
	}
	return context.userRole;
}

export const useSelectOrgUsersTable = (): ISelectOrgUser[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useSelectOrgUsersTable must be used within a PlatformAssitantProvider');
	}
	return context.selectOrgUsers;
}


export const useOrganizationsTable = (): IOrganization[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useOrganizationsTable must be used within a PlatformAssitantProvider');
	}
	return context.organizations;
}

export const useBuildingsTable = (): IBuilding[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useBuildingsTable must be used within a PlatformAssitantProvider');
	}
	return context.buildings;
}

export const useFloorsTable = (): IFloor[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useFloorsTable must be used within a PlatformAssitantProvider');
	}
	return context.floors;
}

export const useGlobalUsersTable = (): IGlobalUser[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGlobalUsersTable must be used within a PlatformAssitantProvider');
	}
	return context.globalUsers;
}

export const useRefreshTokensTable = (): IRefreshToken[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useRefreshTokensTable must be used within a PlatformAssitantProvider');
	}
	return context.refreshTokens;
}

export const useOrgsManagedTable = (): IOrgManaged[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useOrgsManagedTable must be used within a PlatformAssitantProvider');
	}
	return context.orgsManaged;
}

export const useOrgsOfGroupsManagedTable = (): IOrgOfGroupsManaged[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useOrgsOfGroupsManagedTable must be used within a PlatformAssitantProvider');
	}
	return context.orgsOfGroupsManaged;
}

export const useOrgUsersTable = (): IOrgUser[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useOrgUsersTable must be used within a PlatformAssitantProvider');
	}
	return context.orgUsers;
}

export const useGroupsTable = (): IGroup[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGroupsTable must be used within a PlatformAssitantProvider');
	}
	return context.groups;
}

export const useGroupsManagedTable = (): IGroupManaged[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGroupsManagedTable must be used within a PlatformAssitantProvider');
	}
	return context.groupsManaged;
}

export const useGroupMembersTable = (): IGroupMember[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGroupMembersTable must be used within a PlatformAssitantProvider');
	}
	return context.groupMembers;
}

export const useDevicesTable = (): IDevice[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useDevicesTable must be used within a PlatformAssitantProvider');
	}
	return context.devices;
}

export const useTopicsTable = (): ITopic[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useTopicsTable must be used within a PlatformAssitantProvider');
	}
	return context.topics;
}

export const useDashboardsTable = (): IDashboard[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('seDashboardsTable must be used within a PlatformAssitantProvider');
	}
	return context.dashboards;
}

export const useDigitalTwinsTable = (): IDigitalTwin[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useTopicsTable must be used within a PlatformAssitantProvider');
	}
	return context.digitalTwins;
}

export const useUserProfileTable = (): IUserProfile => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useUserProfileTable must be used within a PlatformAssitantProvider');
	}
	return context.userProfile;
}

export const useOrgsMembershipTable = (): IMembershipInOrgs[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useOrgsMembershipTable must be used within a PlatformAssitantProvider');
	}
	return context.orgsMembership;
}

export const useGroupsMembershipTable = (): IMembershipInGroups[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGroupsMembershipTable must be used within a PlatformAssitantProvider');
	}
	return context.groupsMembership;
}

export function usePlatformAssitantDispatch() {
	const context = React.useContext(PlatformAssitantDispatchContext);
	if (context === undefined) {
		throw new Error('usePlatformAssitantDispatch must be used within a AuthProvider');
	}

	return context;
}

export const PlatformAssitantProvider: FC<ChildrenProp> = ({ children }) => {
	const [user, platformAssistantDispatch] = useReducer(PlatformAssitantReducer, initialState);

	return (
		<PlatformAssitantStateContext.Provider value={user}>
			<PlatformAssitantDispatchContext.Provider value={platformAssistantDispatch}>
				{children}
			</PlatformAssitantDispatchContext.Provider>
		</PlatformAssitantStateContext.Provider>
	);
};

