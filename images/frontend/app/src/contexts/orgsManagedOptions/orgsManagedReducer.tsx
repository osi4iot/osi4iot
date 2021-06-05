import { OrgsManagedContextProps, OrgsManagedAction } from "./interfaces";
import {
    ORGS_MANAGED_OPTIONS,

} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    orgsManagedOptionToShow: ORGS_MANAGED_OPTIONS.TABLE,
    orgManagedIdToCreateOrgUsers: 0,
    orgManagedIdToRemoveAllOrgUsers: 0,
    orgManagedRowIndex: 0,
};


export const OrgsManagedReducer = (initialState: OrgsManagedContextProps, action: OrgsManagedAction) => {
    switch (action.type) {
        case "ORGS_MANAGED_OPTION_TO_SHOW":
            return {
                ...initialState,
                orgsManagedOptionToShow: action.payload.orgsManagedOptionToShow
            };

        case "ORG_MANAGED_ID_TO_CREATE_ORG_USERS":
            return {
                ...initialState,
                orgManagedIdToCreateOrgUsers: action.payload.orgManagedIdToCreateOrgUsers
            };

        case "ORG_MANAGED_ID_TO_REMOVE_ALL_ORG_USERS":
            return {
                ...initialState,
                orgManagedIdToRemoveAllOrgUsers: action.payload.orgManagedIdToRemoveAllOrgUsers
            };

        case "ORG_MANAGED_ROW_INDEX":
            return {
                ...initialState,
                orgManagedRowIndex: action.payload.orgManagedRowIndex
            };

        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};