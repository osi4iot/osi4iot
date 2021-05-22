import { PlatformAssistantContextProps, PlatformAssistantAction } from "./interfaces";
import {
    PLATFORM_ADMIN_OPTIONS,
    PLATFORM_ASSISTANT_OPTION,
    ORGS_OPTIONS,
    GLOBAL_USERS_OPTIONS,
    REFRESH_TOKENS_OPTIONS,
    ORG_ADMIN_OPTIONS,
    ORG_USERS_OPTIONS,
    GROUPS_OPTIONS,
    GROUP_ADMIN_OPTIONS,
    DEVICES_OPTIONS,
    GROUP_MEMBERS_OPTIONS,
    USER_OPTIONS,
    USER_PROFILE_OPTIONS,
    HOME_OPTIONS,

} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    userRole: "unknown",
    numOrganizationManaged: 0,
    numGroupsManaged: 0,
    numDevicesManage: 0,
    platformAssitantOptionToShow: PLATFORM_ASSISTANT_OPTION.HOME,
    platformAdminOptionToShow: PLATFORM_ADMIN_OPTIONS.ORGS,
    orgsOptionToShow: ORGS_OPTIONS.TABLE,
    orgIdToEdit: 0,
    globalUsersOptionToShow: GLOBAL_USERS_OPTIONS.TABLE,
    globalUserIdToEdit: 0,
    refreshTokensOptionToShow: REFRESH_TOKENS_OPTIONS.TABLE,
    refreshTokenIdToEdit: 0,
    orgAdminOptionToShow: ORG_ADMIN_OPTIONS.ORGS_MANAGED,
    orgUsersOptionToShow: ORG_USERS_OPTIONS.TABLE,
    orgUserIdToEdit: 0,
    groupsOptionToShow: GROUPS_OPTIONS.TABLE,
    groupIdToEdit: 0,
    groupAdminOptionToShow: GROUP_ADMIN_OPTIONS.GROUPS_MANAGED,
    devicesOptionToShow: DEVICES_OPTIONS.TABLE,
    deviceIdToEdit: 0,
    groupMembersOptionToShow: GROUP_MEMBERS_OPTIONS.TABLE,
    groupMemberIdToEdit: 0,
    userOptionToShow: USER_OPTIONS.USER_PROFILE,
    userProfileOptionToShow: USER_PROFILE_OPTIONS.USER_PROFILE,
    homeOptionToShow: HOME_OPTIONS.PLATFORM_LAYOUT,
    loading: false,
    errorMessage: null,
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

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};