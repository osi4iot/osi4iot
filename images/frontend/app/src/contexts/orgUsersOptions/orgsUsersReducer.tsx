import { OrgUsersContextProps, OrgUsersAction } from "./interfaces";
import {
    ORG_USERS_OPTIONS,

} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    orgUsersOptionToShow: ORG_USERS_OPTIONS.TABLE,
    orgUserOrgIdToEdit: 0,
    orgUserUserIdToEdit: 0,
    orgUserRowIndexToEdit: 0,
};

export const OrgUsersReducer = (initialState: OrgUsersContextProps, action: OrgUsersAction) => {
    switch (action.type) {
        case "ORG_USERS_OPTION_TO_SHOW":
            return {
                ...initialState,
                orgUsersOptionToShow: action.payload.orgUsersOptionToShow
            };

        case "ORG_USER_ORG_ID_TO_EDIT":
            return {
                ...initialState,
                orgUserOrgIdToEdit: action.payload.orgUserOrgIdToEdit
            };

        case "ORG_USER_USER_ID_TO_EDIT":
            return {
                ...initialState,
                orgUserUserIdToEdit: action.payload.orgUserUserIdToEdit
            };

        case "ORG_USER_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                orgUserRowIndexToEdit: action.payload.orgUserRowIndexToEdit
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};