import { PlatformAssistantContextProps, PlatformAssistantAction } from "./interfaces";
import PLATFORM_ASSISTANT_OPTIONS from "./platformAssistantOptions";

export const initialState = {
    userRole: "unknown",
    numOrganizationManaged: 0,
    numGroupsManaged: 0,
    numDevicesManage: 0,
    platformOptionsToShow: PLATFORM_ASSISTANT_OPTIONS.UNKNOWN,
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
        
        case "PLATFORM_OPTIONS_TO_SHOW":
                return {
                    ...initialState,
                    platformOptionsToShow: action.payload.platformOptionsToShow
                };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};