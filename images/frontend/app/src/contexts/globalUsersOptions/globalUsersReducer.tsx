import { GlobalUsersContextProps, GlobalUsersAction } from "./interfaces";
import {
    GLOBAL_USERS_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    globalUsersOptionToShow: GLOBAL_USERS_OPTIONS.TABLE,
    globalUserIdToEdit: 0,
    globalUserRowIndexToEdit: 0
};

export const GlobalUsersReducer = (initialState: GlobalUsersContextProps, action: GlobalUsersAction) => {
    switch (action.type) {

        case "GLOBAL_USER_OPTION_TO_SHOW":
            return {
                ...initialState,
                globalUsersOptionToShow: action.payload.globalUsersOptionToShow
            };

        case "GLOBAL_USER_ID_TO_EDIT":
            return {
                ...initialState,
                globalUserIdToEdit: action.payload.globalUserIdToEdit
            };

        case "GLOBAL_USER_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                globalUserRowIndexToEdit: action.payload.globalUserRowIndexToEdit
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};