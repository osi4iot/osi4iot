import React, { createContext, FC, useContext, useReducer } from 'react';
import { IBuilding } from '../../components/PlatformAssistant/TableColumns/buildingsColumns';
import { IDashboard } from '../../components/PlatformAssistant/TableColumns/dashboardsColumns';
import { IDigitalTwin } from '../../components/PlatformAssistant/TableColumns/digitalTwinsColumns';
import { IFloor } from '../../components/PlatformAssistant/TableColumns/floorsColumns';
import { IGlobalUser } from '../../components/PlatformAssistant/TableColumns/globalUsersColumns';
import { IGroupMember } from '../../components/PlatformAssistant/TableColumns/groupMemberColumns';
import { IGroup } from '../../components/PlatformAssistant/TableColumns/groupsColumns';
import { IGroupManaged } from '../../components/PlatformAssistant/TableColumns/groupsManagedColumns';
import { INodeRedInstance } from '../../components/PlatformAssistant/TableColumns/nodeRedInstancesInOrgsColumns';
import { IMembershipInGroups } from '../../components/PlatformAssistant/TableColumns/membershipInGroups';
import { IMembershipInOrgs } from '../../components/PlatformAssistant/TableColumns/membershipInOrgs';
import { IOrganization } from '../../components/PlatformAssistant/TableColumns/organizationsColumns';
import { IOrgManaged } from '../../components/PlatformAssistant/TableColumns/organizationsManagedColumns';
import { IOrgOfGroupsManaged } from '../../components/PlatformAssistant/TableColumns/orgsOfGroupsManagedColumns';
import { IOrgUser } from '../../components/PlatformAssistant/TableColumns/orgUsersColumns';
import { IRefreshToken } from '../../components/PlatformAssistant/TableColumns/refreshTokensColumns';
import { ISelectOrgUser } from '../../components/PlatformAssistant/TableColumns/selectOrgUsersColumns';
import { ITopic } from '../../components/PlatformAssistant/TableColumns/topicsColumns';
import { IUserProfile } from '../../components/PlatformAssistant/UserOptions/UserProfile';
import { ChildrenProp } from '../../interfaces/interfaces'
import { PlatformAssistantContextProps } from './interfaces'
import { initialState, PlatformAssitantReducer } from './platformAssistantReducer';
import { IMlModel } from '../../components/PlatformAssistant/TableColumns/mlModelsColumns';
import { IAsset } from '../../components/PlatformAssistant/TableColumns/assetsColumns';
import { ISensor } from '../../components/PlatformAssistant/TableColumns/sensorsColumns';
import { IAssetType } from '../../components/PlatformAssistant/TableColumns/assetTypesColumns';
import IAssetS3Folder from '../../components/PlatformAssistant/TableColumns/assetS3Folder.interface';
import { ISensorType } from '../../components/PlatformAssistant/TableColumns/sensorTypesColumns';
import IAssetTopic from '../../components/PlatformAssistant/TableColumns/assetTopics.interface';

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

export const useReloadSelectOrgUsersTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadSelectOrgUsersTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadSelectOrgUsersTable;
}


export const useOrganizationsTable = (): IOrganization[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useOrganizationsTable must be used within a PlatformAssitantProvider');
	}
	return context.organizations;
}

export const useNodeRedInstancesTable = (): INodeRedInstance[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useNodeRedInstancesTable must be used within a PlatformAssitantProvider');
	}
	return context.nodeRedInstances;
}

export const useReloadNodeRedInstancesTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadNodeRedInstancesTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadNodeRedInstancesTable;
}

export const useBuildingsTable = (): IBuilding[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useBuildingsTable must be used within a PlatformAssitantProvider');
	}
	return context.buildings;
}

export const useReloadBuildingsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadBuildingsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadBuildingsTable;
}

export const useFloorsTable = (): IFloor[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useFloorsTable must be used within a PlatformAssitantProvider');
	}
	return context.floors;
}

export const useReloadFloorsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadFloorsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadFloorsTable;
}

export const useGlobalUsersTable = (): IGlobalUser[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGlobalUsersTable must be used within a PlatformAssitantProvider');
	}
	return context.globalUsers;
}

export const useReloadGlobalUsersTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadGlobalUsersTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadGlobalUsersTable;
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

export const useReloadOrgsManagedTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadOrgsManagedTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadOrgsManagedTable;
}


export const useOrgsOfGroupsManagedTable = (): IOrgOfGroupsManaged[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useOrgsOfGroupsManagedTable must be used within a PlatformAssitantProvider');
	}
	return context.orgsOfGroupsManaged;
}

export const useReloadOrgsOfGroupsManagedTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadOrgsOfGroupsManagedTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadOrgsOfGroupsManagedTable;
}

export const useOrgUsersTable = (): IOrgUser[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useOrgUsersTable must be used within a PlatformAssitantProvider');
	}
	return context.orgUsers;
}

export const useReloadOrgUsersTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadOrgUsersTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadOrgUsersTable;
}

export const useGroupsTable = (): IGroup[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGroupsTable must be used within a PlatformAssitantProvider');
	}
	return context.groups;
}

export const useReloadGroupsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadGroupsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadGroupsTable;
}

export const useGroupsManagedTable = (): IGroupManaged[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGroupsManagedTable must be used within a PlatformAssitantProvider');
	}
	return context.groupsManaged;
}

export const useReloadGroupsManagedTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadGroupsManagedTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadGroupsManagedTable
}

export const useGroupMembersTable = (): IGroupMember[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGroupMembersTable must be used within a PlatformAssitantProvider');
	}
	return context.groupMembers;
}

export const useReloadGroupMembersTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadGroupMembersTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadGroupMembersTable;
}

export const useAssetTypesTable = (): IAssetType[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useAssetsTable must be used within a PlatformAssitantProvider');
	}
	return context.assetTypes;
}

export const useReloadAssetTypesTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadAssetTypesTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadAssetTypesTable;
}

export const useAssetsTable = (): IAsset[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useAssetsTable must be used within a PlatformAssitantProvider');
	}
	return context.assets;
}

export const useReloadAssetsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadAssetsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadAssetsTable;
}

export const useAssetTopicsTable = (): IAssetTopic[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useAssetTopiosTable must be used within a PlatformAssitantProvider');
	}
	return context.assetTopics;
}

export const useReloadAssetTopicsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadAssetTopicssTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadAssetTopicsTable;
}

export const useSensorTypesTable = (): ISensorType[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useSensorsTable must be used within a PlatformAssitantProvider');
	}
	return context.sensorTypes;
}

export const useReloadSensorTypesTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadSensorTypesTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadSensorTypesTable;
}

export const useSensorsTable = (): ISensor[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useSensorsTable must be used within a PlatformAssitantProvider');
	}
	return context.sensors;
}

export const useReloadSensorsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadSensorsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadSensorsTable;
}

export const useTopicsTable = (): ITopic[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useTopicsTable must be used within a PlatformAssitantProvider');
	}
	return context.topics;
}

export const useReloadTopicsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadTopicsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadTopicsTable;
}

export const useDashboardsTable = (): IDashboard[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useDashboardsTable must be used within a PlatformAssitantProvider');
	}
	return context.dashboards;
}

export const useReloadDashboardsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadDashboardsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadDashboardsTable;
}

export const useDigitalTwinsTable = (): IDigitalTwin[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('uuseDigitalTwinsTable must be used within a PlatformAssitantProvider');
	}
	return context.digitalTwins;
}

export const useReloadDigitalTwinsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadDigitalTwinsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadDigitalTwinsTable;
}

export const useMlModelsTable = (): IMlModel[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useMlModelsTable must be used within a PlatformAssitantProvider');
	}
	return context.mlModels;
}

export const useReloadMlModelsTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadMlModelsTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadMlModelsTable;
}

export const useAssetS3FoldersTable = (): IAssetS3Folder[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useAssetS3FoldersTable must be used within a PlatformAssitantProvider');
	}
	return context.assetS3Folders;
}

export const useReloadAssetS3FoldersTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadAssetS3FoldersTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadAssetS3FoldersTable;
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

export const useReloadOrgsMembershipTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadOrgsMembershipTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadOrgsMembershipTable ;
}

export const useGroupsMembershipTable = (): IMembershipInGroups[] => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useGroupsMembershipTable must be used within a PlatformAssitantProvider');
	}
	return context.groupsMembership;
}

export const useReloadGroupsMembershipTable = (): boolean => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useReloadGroupsMembershipTable must be used within a PlatformAssitantProvider');
	}
	return context.reloadGroupsMembershipTable;
}

export const useWindowObjectReferences = (): Record<string, Window | null> => {
	const context = useContext(PlatformAssitantStateContext);
	if (context === undefined) {
		throw new Error('useWindowObjectReferences must be used within a PlatformAssitantProvider');
	}
	return context.windowObjectReferences;
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

