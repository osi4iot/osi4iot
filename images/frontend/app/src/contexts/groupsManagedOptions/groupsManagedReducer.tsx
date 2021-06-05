import { GroupsManagedContextProps, GroupsManagedAction } from "./interfaces";
import {
    GROUPS_MANAGED_OPTIONS,

} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.TABLE,
    groupManagedIdToCreateGroupMembers: 0,
    groupManagedIdToRemoveAllGroupMembers: 0,
    groupManagedRowIndex: 0,
};


export const GroupsManagedReducer = (initialState: GroupsManagedContextProps, action: GroupsManagedAction) => {
    switch (action.type) {
        case "GROUPS_MANAGED_OPTION_TO_SHOW":
            return {
                ...initialState,
                groupsManagedOptionToShow: action.payload.groupsManagedOptionToShow
            };

        case "GROUP_MANAGED_ID_TO_CREATE_GROUP_MEMBERS":
            return {
                ...initialState,
                groupManagedIdToCreateGroupMembers: action.payload.groupManagedIdToCreateGroupMembers
            };

        case "GROUP_MANAGED_ID_TO_REMOVE_ALL_GROUP_MEMBERS":
            return {
                ...initialState,
                groupManagedIdToRemoveAllGroupMembers: action.payload.groupManagedIdToRemoveAllGroupMembers
            };

        case "GROUP_MANAGED_ROW_INDEX":
            return {
                ...initialState,
                groupManagedRowIndex: action.payload.groupManagedRowIndex
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};