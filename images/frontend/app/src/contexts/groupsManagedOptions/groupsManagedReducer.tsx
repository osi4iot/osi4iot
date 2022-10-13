import { GroupsManagedContextProps, GroupsManagedAction } from "./interfaces";
import {
    GROUPS_MANAGED_OPTIONS,

} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    groupsManagedOptionToShow: GROUPS_MANAGED_OPTIONS.TABLE,
    groupManagedIdToCreateGroupMembers: 0,
    groupManagedIdToRemoveAllGroupMembers: 0,
    groupManagedRowIndex: 0,
    groupManagedIdToEdit: 0,
    groupManagedBuildingId: 0,
    groupManagedNriId: 0,
    groupManagedInputFormData: {
        groupId: 0,
        name: "",
        acronym: "",
        orgId: 0,
        folderPermission: "Viewer",
        mqttAccessControl: "Pub & Sub",
        telegramInvitationLink: "",
        telegramChatId: "",
        nriInGroupId: 0,
        nriInGroupIconLongitude: 0,
        nriInGroupIconLatitude: 0,
        nriInGroupIconRadio: 1.0
    }
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

        case "GROUP_MANAGED_ID_TO_EDIT":
            return {
                ...initialState,
                groupManagedIdToEdit: action.payload.groupManagedIdToEdit
            };

        case "GROUP_MANAGED_BUILDING_ID":
            return {
                ...initialState,
                groupManagedBuildingId: action.payload.groupManagedBuildingId
            };

        case "GROUP_MANAGED_INPUT_DATA":
            return {
                ...initialState,
                groupManagedInputFormData: action.payload.groupManagedInputFormData
            };

        case "GROUP_MANAGED_NRI_ID":
            return {
                ...initialState,
                groupManagedNriId: action.payload.groupManagedNriId
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};