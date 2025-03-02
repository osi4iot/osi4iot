import { PlatformAssistantContextProps, PlatformAssistantAction } from "./interfaces";
import {
    PLATFORM_ASSISTANT_OPTION,
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";

const initialUserProfile = {
    userId: 0,
    name: "",
    firstName: "",
    surname: "",
    login: "",
    email: "",
}

export const initialState = {
    userRole: "unknown",
    numOrganizationManaged: 0,
    numGroupsManaged: 0,
    numAssetTypesManaged: 0,
    numAssetsManaged: 0,
    numSensorsManaged: 0,
    numDigitalTwinsManaged: 0,
    numMLModelsManaged: 0,
    platformAssitantOptionToShow: PLATFORM_ASSISTANT_OPTION.HOME,
    selectOrgUsers: [],
    reloadSelectOrgUsersTable: false,
    organizations: [],
    nodeRedInstances: [],
    reloadNodeRedInstancesTable: false,
    buildings: [],
    reloadBuildingsTable: false,
    floors: [],
    reloadFloorsTable: false,
    globalUsers: [],
    reloadGlobalUsersTable: false,
    refreshTokens: [],
    orgsManaged: [],
    orgsOfGroupsManaged: [],
    reloadOrgsOfGroupsManagedTable: false,
    reloadOrgsManagedTable: false,
    orgUsers: [],
    reloadOrgUsersTable: false,
    groups: [],
    reloadGroupsTable: false,
    groupsManaged: [],
    reloadGroupsManagedTable: false,
    groupMembers: [],
    reloadGroupMembersTable: false,
    assetTypes: [],
    reloadAssetTypesTable: false,
    assets: [],
    reloadAssetsTable: false,
    assetsWithMarker: [],
    reloadAssetsWithMarkerTable: false,
    assetTopics: [],
    reloadAssetTopicsTable: false,
    assetS3Folders: [],
    reloadAssetS3FoldersTable: false,
    sensorTypes: [],
    reloadSensorTypesTable: false,
    sensors: [],
    reloadSensorsTable: false,
    topics: [],
    reloadTopicsTable: false,
    dashboards: [],
    reloadDashboardsTable: false,
    digitalTwins: [],
    reloadDigitalTwinsTable: false,
    mlModels: [],
    reloadMlModelsTable: false,
    userProfile: initialUserProfile,
    orgsMembership: [],
    reloadOrgsMembershipTable: false,
    groupsMembership: [],
    reloadGroupsMembershipTable: false,
    windowObjectReferences: {},
};

export const PlatformAssitantReducer = (initialState: PlatformAssistantContextProps, action: PlatformAssistantAction) => {
    switch (action.type) {
        case "USER_ROLE":
            return {
                ...initialState,
                userRole: action.payload.userRole,
                numOrganizationManaged: action.payload.numOrganizationManaged,
                numGroupsManaged: action.payload.numGroupsManaged,
                numAssetTypesManaged: action.payload.numAssetTypesManaged,
                numAssetsManaged: action.payload.numAssetsManaged,
                numSensorsManaged: action.payload.numSensorsManaged,
                numDigitalTwinsManaged: action.payload.numDigitalTwinsManaged,
                numMLModelsManaged: action.payload.numMLModelsManaged,
            };

        case "PLATFORM_ASSISTANT_OPTION_TO_SHOW":
            return {
                ...initialState,
                platformOptionsToShow: action.payload.platformAssitantOptionToShow
            };

        case "SELECT_ORG_USERS_TABLE":
            return {
                ...initialState,
                selectOrgUsers: action.payload.selectOrgUsers
            };

        case "RELOAD_SELECT_ORG_USERS_TABLE":
            return {
                ...initialState,
                reloadSelectOrgUsersTable: action.payload.reloadSelectOrgUsersTable
            };

        case "ORGANIZATIONS_TABLE":
            return {
                ...initialState,
                organizations: action.payload.organizations
            };

        case "NODERED_INSTANCES_TABLE":
            return {
                ...initialState,
                nodeRedInstances: action.payload.nodeRedInstances
            };

        case "RELOAD_NODERED_INSTANCES_TABLE":
            return {
                ...initialState,
                reloadNodeRedInstancesTable: action.payload.reloadNodeRedInstancesTable
            };

        case "BUILDINGS_TABLE":
            return {
                ...initialState,
                buildings: action.payload.buildings
            };

        case "RELOAD_BUILDINGS_TABLE":
            return {
                ...initialState,
                reloadBuildingsTable: action.payload.reloadBuildingsTable
            };

        case "FLOORS_TABLE":
            return {
                ...initialState,
                floors: action.payload.floors
            };

        case "RELOAD_FLOORS_TABLE":
            return {
                ...initialState,
                reloadFloorsTable: action.payload.reloadFloorsTable
            };

        case "GLOBAL_USERS_TABLE":
            return {
                ...initialState,
                globalUsers: action.payload.globalUsers
            };

        case "RELOAD_GLOBAL_USERS_TABLE":
            return {
                ...initialState,
                reloadGlobalUsersTable: action.payload.reloadGlobalUsersTable
            };

        case "REFRESH_TOKENS_TABLE":
            return {
                ...initialState,
                refreshTokens: action.payload.refreshTokens
            };

        case "ORGS_MANAGED_TABLE":
            return {
                ...initialState,
                orgsManaged: action.payload.orgsManaged
            };

        case "RELOAD_ORGS_MANAGED_TABLE":
            return {
                ...initialState,
                reloadOrgsManagedTable: action.payload.reloadOrgsManagedTable
            };

        case "ORGS_OF_GROUPS_MANAGED_TABLE":
            return {
                ...initialState,
                orgsOfGroupsManaged: action.payload.orgsOfGroupsManaged
            };

        case "RELOAD_ORGS_OF_GROUPS_MANAGED_TABLE":
            return {
                ...initialState,
                reloadOrgsOfGroupsManagedTable: action.payload.reloadOrgsOfGroupsManagedTable
            };

        case "ORGS_USERS_TABLE":
            return {
                ...initialState,
                orgUsers: action.payload.orgUsers
            };

        case "RELOAD_ORGS_USERS_TABLE":
            return {
                ...initialState,
                reloadOrgUsersTable: action.payload.reloadOrgUsersTable
            };

        case "GROUPS_TABLE":
            return {
                ...initialState,
                groups: action.payload.groups
            };

        case "RELOAD_GROUPS_TABLE":
            return {
                ...initialState,
                reloadGroupsTable: action.payload.reloadGroupsTable
            };

        case "GROUPS_MANAGED_TABLE":
            return {
                ...initialState,
                groupsManaged: action.payload.groupsManaged
            };

        case "RELOAD_GROUPS_MANAGED_TABLE":
            return {
                ...initialState,
                reloadGroupsManagedTable: action.payload.reloadGroupsManagedTable
            };

        case "GROUPS_MEMBERS_TABLE":
            return {
                ...initialState,
                groupMembers: action.payload.groupMembers
            };

        case "RELOAD_GROUPS_MEMBERS_TABLE":
            return {
                ...initialState,
                reloadGroupMembersTable: action.payload.reloadGroupMembersTable
            };

        case "ASSET_TYPES_TABLE":
            return {
                ...initialState,
                assetTypes: action.payload.assetTypes
            };

        case "RELOAD_ASSET_TYPES_TABLE":
            return {
                ...initialState,
                reloadAssetTypesTable: action.payload.reloadAssetTypesTable
            };

        case "ASSETS_TABLE":
            return {
                ...initialState,
                assets: action.payload.assets
            };

        case "RELOAD_ASSETS_TABLE":
            return {
                ...initialState,
                reloadAssetsTable: action.payload.reloadAssetsTable
            };

        case "ASSETS_WITH_MARKER_TABLE":
            return {
                ...initialState,
                assetsWithMarker: action.payload.assetsWithMarker
            };

        case "RELOAD_ASSETS_WITH_MARKER_TABLE":
            return {
                ...initialState,
                reloadAssetsWithMarkerTable: action.payload.reloadAssetsWithMarkerTable
            };

        case "ASSET_TOPICS_TABLE":
            return {
                ...initialState,
                assetTopics: action.payload.assetTopics
            };

        case "RELOAD_ASSET_TOPICS_TABLE":
            return {
                ...initialState,
                reloadAssetTopicsTable: action.payload.reloadAssetTopicsTable
            };

        case "ASSET_S3_FOLDERS_TABLE":
            return {
                ...initialState,
                assetS3Folders: action.payload.assetS3Folders
            };

        case "RELOAD_ASSET_S3_FOLDERS_TABLE":
            return {
                ...initialState,
                reloadAssetS3FoldersTable: action.payload.reloadAssetS3FoldersTable
            };

        case "SENSOR_TYPES_TABLE":
            return {
                ...initialState,
                sensorTypes: action.payload.sensorTypes
            };

        case "RELOAD_SENSOR_TYPES_TABLE":
            return {
                ...initialState,
                reloadSensorTypesTable: action.payload.reloadSensorTypesTable
            };

        case "SENSORS_TABLE":
            return {
                ...initialState,
                sensors: action.payload.sensors
            };

        case "RELOAD_SENSORS_TABLE":
            return {
                ...initialState,
                reloadSensorsTable: action.payload.reloadSensorsTable
            };

        case "TOPICS_TABLE":
            return {
                ...initialState,
                topics: action.payload.topics
            };

        case "RELOAD_TOPICS_TABLE":
            return {
                ...initialState,
                reloadTopicsTable: action.payload.reloadTopicsTable
            };

        case "DASHBOARDS_TABLE":
            return {
                ...initialState,
                dashboards: action.payload.dashboards
            };

        case "RELOAD_DASHBOARDS_TABLE":
            return {
                ...initialState,
                reloadDashboardsTable: action.payload.reloadDashboardsTable
            };

        case "DIGITAL_TWIN_TABLE":
            return {
                ...initialState,
                digitalTwins: action.payload.digitalTwins
            };

        case "RELOAD_DIGITAL_TWIN_TABLE":
            return {
                ...initialState,
                reloadDigitalTwinsTable: action.payload.reloadDigitalTwinsTable
            };

        case "ML_MODEL_TABLE":
            return {
                ...initialState,
                mlModels: action.payload.mlModels
            };

        case "RELOAD_ML_MODEL_TABLE":
            return {
                ...initialState,
                reloadMlModelsTable: action.payload.reloadMlModelsTable
            };

        case "USER_PROFILE_TABLE":
            return {
                ...initialState,
                userProfile: action.payload.userProfile
            };

        case "ORGS_MEMBERSHIP_TABLE":
            return {
                ...initialState,
                orgsMembership: action.payload.orgsMembership
            };

        case "RELOAD_ORGS_MEMBERSHIP_TABLE":
            return {
                ...initialState,
                reloadOrgsMembershipTable: action.payload.reloadOrgsMembershipTable
            };

        case "GROUP_MEMBERSHIP_TABLE":
            return {
                ...initialState,
                groupsMembership: action.payload.groupsMembership
            };

        case "RELOAD_GROUP_MEMBERSHIP_TABLE":
            return {
                ...initialState,
                reloadGroupsMembershipTable: action.payload.reloadGroupsMembershipTable
            };

        case "WINDOWS_OBJECT_REFERENCES":
            return {
                ...initialState,
                windowObjectReferences: action.payload.windowObjectReferences
            };

        case "RESET_TABLES":
            return {
                userRole: "unknown",
                numOrganizationManaged: 0,
                numGroupsManaged: 0,
                numAssetTypesManaged: 0,
                numAssetsManaged: 0,
                numSensorsManaged: 0,
                numDigitalTwinsManaged: 0,
                numMLModelsManaged: 0,
                platformAssitantOptionToShow: PLATFORM_ASSISTANT_OPTION.HOME,
                selectOrgUsers: [],
                reloadSelectOrgUsersTable: false,
                organizations: [],
                nodeRedInstances: [],
                reloadNodeRedInstancesTable: false,
                buildings: [],
                reloadBuildingsTable: false,
                floors: [],
                reloadFloorsTable: false,
                globalUsers: [],
                reloadGlobalUsersTable: false,
                refreshTokens: [],
                orgsManaged: [],
                reloadOrgsManagedTable: false,
                orgsOfGroupsManaged: [],
                reloadOrgsOfGroupsManagedTable: false,
                orgUsers: [],
                reloadOrgUsersTable: false,
                groups: [],
                reloadGroupsTable: false,
                groupsManaged: [],
                reloadGroupsManagedTable: false,
                groupMembers: [],
                reloadGroupMembersTable: false,
                assetTypes: [],
                reloadAssetTypesTable: false,
                assets: [],
                reloadAssetsTable: false,
                assetsWithMarker: [],
                reloadAssetsWithMarkerTable: false,
                assetTopics: [],
                reloadAssetTopicsTable: false,
                assetS3Folders: [],
                reloadAssetS3FoldersTable: false,
                sensorTypes: [],
                reloadSensorTypesTable: false,
                sensors: [],
                reloadSensorsTable: false,
                topics: [],
                reloadTopicsTable: false,
                dashboards: [],
                reloadDashboardsTable: false,
                digitalTwins: [],
                reloadDigitalTwinsTable: false,
                mlModels: [],
                reloadMlModelsTable: false,
                userProfile: initialUserProfile,
                orgsMembership: [],
                reloadOrgsMembershipTable: false,
                groupsMembership: [],
                reloadGroupsMembershipTable: false,
                windowObjectReferences: {},
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};