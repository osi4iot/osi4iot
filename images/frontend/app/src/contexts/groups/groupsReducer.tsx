import { GroupsContextProps, GroupsAction } from "./interfaces";
import {
    GROUPS_OPTIONS,
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    groupsOptionToShow: GROUPS_OPTIONS.TABLE,
    groupIdToEdit: 0,
};

export const GroupsReducer = (initialState: GroupsContextProps, action: GroupsAction) => {
    switch (action.type) {
        case "GROUPS_OPTION_TO_SHOW":
            return {
                ...initialState,
                groupsOptionToShow: action.payload.groupsOptionToShow
            };

        case "GROUP_ID_TO_EDIT":
            return {
                ...initialState,
                groupIdToEdit: action.payload.groupIdToEdit
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};