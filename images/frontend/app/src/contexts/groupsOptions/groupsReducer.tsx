import { GroupsContextProps, GroupsAction } from "./interfaces";
import {
    GROUPS_OPTIONS,
    GROUPS_PREVIOUS_OPTIONS
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    groupsOptionToShow: GROUPS_OPTIONS.TABLE,
    groupsPreviousOption: GROUPS_PREVIOUS_OPTIONS.TABLE,
    groupIdToEdit: 0,
    groupRowIndexToEdit: 0,
    groupBuildingId: 0,
    groupInputFormData: {
        orgId: 1,
        name: "",
        acronym: "",
        folderPermission: "Viewer",
        telegramInvitationLink: "",
        telegramChatId: "",
        floorNumber: 0,
        featureIndex: 0,
        groupAdminDataArray: [
            {
                firstName: "",
                surname: "",
                email: "",
            }
        ]
    }
};

export const GroupsReducer = (initialState: GroupsContextProps, action: GroupsAction) => {
    switch (action.type) {
        case "GROUPS_OPTION_TO_SHOW":
            return {
                ...initialState,
                groupsOptionToShow: action.payload.groupsOptionToShow
            };

        case "GROUPS_PREVIOUS_OPTION":
            return {
                ...initialState,
                groupsPreviousOption: action.payload.groupsPreviousOption
            };

        case "GROUP_ID_TO_EDIT":
            return {
                ...initialState,
                groupIdToEdit: action.payload.groupIdToEdit
            };

        case "GROUP_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                groupRowIndexToEdit: action.payload.groupRowIndexToEdit
            };

        case "GROUP_BUILDING_ID":
            return {
                ...initialState,
                groupBuildingId: action.payload.groupBuildingId
            };

        case "GROUP_INPUT_DATA":
            return {
                ...initialState,
                groupInputFormData: action.payload.groupInputFormData
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};