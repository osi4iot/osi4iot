import { PlatformAssistantContextProps, PlatformAssistantAction } from "./interfaces";
import {
    PLATFORM_ASSISTANT_OPTION,
} from "../../components/PlatformAssistant/platformAssistantOptions";

const initialUserProfile = {
    userId: 0,
    name: "",
    firstName: "",
    surname: "",
    login: "",
    email: "",
    telegramId: "",
}

export const initialState = {
    userRole: "unknown",
    numOrganizationManaged: 0,
    numGroupsManaged: 0,
    numDevicesManage: 0,
    platformAssitantOptionToShow: PLATFORM_ASSISTANT_OPTION.HOME,
    selectOrgUsers: [],
    organizations: [],
    buildings: [],
    floors: [],
    globalUsers: [],
    refreshTokens: [],
    orgsManaged: [],
    orgsOfGroupsManaged: [],
    orgUsers: [],
    groups: [],
    groupsManaged: [],
    groupMembers: [],
    devices: [],
    topics: [],
    dashboards: [],
    digitalTwins: [],
    userProfile: initialUserProfile,
    orgsMembership: [],
    groupsMembership: [],
};

export const PlatformAssitantReducer = (initialState: PlatformAssistantContextProps, action: PlatformAssistantAction) => {
    switch (action.type) {
        case "USER_ROLE":
            return {
                ...initialState,
                userRole: action.payload.userRole,
                numOrganizationManaged: action.payload.numOrganizationManaged,
                numGroupsManaged: action.payload.numGroupsManaged,
                numDevicesManage: action.payload.numDevicesManage
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

        case "ORGANIZATIONS_TABLE":
            return {
                ...initialState,
                organizations: action.payload.organizations
            };

        case "BUILDINGS_TABLE":
            return {
                ...initialState,
                buildings: action.payload.buildings
            };

        case "FLOORS_TABLE":
            return {
                ...initialState,
                floors: action.payload.floors
            };

        case "GLOBAL_USERS_TABLE":
            return {
                ...initialState,
                globalUsers: action.payload.globalUsers
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

        case "ORGS_OF_GROUPS_MANAGED_TABLE":
            return {
                ...initialState,
                orgsOfGroupsManaged: action.payload.orgsOfGroupsManaged
            };

        case "ORGS_USERS_TABLE":
            return {
                ...initialState,
                orgUsers: action.payload.orgUsers
            };

        case "GROUPS_TABLE":
            return {
                ...initialState,
                groups: action.payload.groups
            };

        case "GROUPS_MANAGED_TABLE":
            return {
                ...initialState,
                groupsManaged: action.payload.groupsManaged
            };

        case "GROUPS_MEMBERS_TABLE":
            return {
                ...initialState,
                groupMembers: action.payload.groupMembers
            };

        case "DEVICES_TABLE":
            return {
                ...initialState,
                devices: action.payload.devices
            };

        case "TOPICS_TABLE":
            return {
                ...initialState,
                topics: action.payload.topics
            };

        case "DASHBOARDS_TABLE":
            return {
                ...initialState,
                dashboards: action.payload.dashboards
            };

        case "DIGITAL_TWIN_TABLE":
            return {
                ...initialState,
                digitalTwins: action.payload.digitalTwins
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

        case "GROUP_MEMBERSHIP_TABLE":
            return {
                ...initialState,
                groupsMembership: action.payload.groupsMembership
            };

        case "RESET_TABLES":
            return {
                userRole: "unknown",
                numOrganizationManaged: 0,
                numGroupsManaged: 0,
                numDevicesManage: 0,
                platformAssitantOptionToShow: PLATFORM_ASSISTANT_OPTION.HOME,
                selectOrgUsers: [],
                organizations: [],
                buildings: [],
                floors: [],
                globalUsers: [],
                refreshTokens: [],
                orgsManaged: [],
                orgsOfGroupsManaged: [],
                orgUsers: [],
                groups: [],
                groupsManaged: [],
                groupMembers: [],
                devices: [],
                topics: [],
                dashboards: [],
                digitalTwins: [],
                userProfile: initialUserProfile,
                orgsMembership: [],
                groupsMembership: [],
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};