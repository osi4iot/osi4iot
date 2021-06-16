import { OrgsContextProps, OrgsAction } from "./interfaces";
import {
    ORGS_OPTIONS
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    orgsOptionToShow: ORGS_OPTIONS.TABLE,
    orgIdToEdit: 0,
    orgRowIndexToEdit: 0
};

export const OrgsReducer = (initialState: OrgsContextProps, action: OrgsAction) => {
    switch (action.type) {
        case "ORGS_OPTION_TO_SHOW":
            return {
                ...initialState,
                orgsOptionToShow: action.payload.orgsOptionToShow
            };

        case "ORG_ID_TO_EDIT":
            return {
                ...initialState,
                orgIdToEdit: action.payload.orgIdToEdit
            };

        case "ORG_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                orgRowIndexToEdit: action.payload.orgRowIndexToEdit
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};