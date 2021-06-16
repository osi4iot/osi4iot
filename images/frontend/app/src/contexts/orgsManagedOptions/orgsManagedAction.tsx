import {
	OrgsManagedDispatch,
	IOrgsManagedOptionToShow,
	IOrgManagedIdToCreateOrgUsers,
	IOrgManagedIdToRemoveAllOrgUsers,
	IOrgsManagedRowIndex
} from "./interfaces";


export function setOrgsManagedOptionToShow(orgsManagedDispatch: OrgsManagedDispatch, data: IOrgsManagedOptionToShow) {
	orgsManagedDispatch({ type: "ORGS_MANAGED_OPTION_TO_SHOW", payload: data });
}

export function setOrgManagedIdToCreateOrgUsers(orgsManagedDispatch: OrgsManagedDispatch, data: IOrgManagedIdToCreateOrgUsers) {
	orgsManagedDispatch({ type: "ORG_MANAGED_ID_TO_CREATE_ORG_USERS", payload: data });
}

export function setOrgManagedIdToRemoveAllOrgUsers(orgsManagedDispatch: OrgsManagedDispatch, data: IOrgManagedIdToRemoveAllOrgUsers) {
	orgsManagedDispatch({ type: "ORG_MANAGED_ID_TO_REMOVE_ALL_ORG_USERS", payload: data });
}

export function setOrgManagedRowIndex(orgsManagedDispatch: OrgsManagedDispatch, data: IOrgsManagedRowIndex) {
	orgsManagedDispatch({ type: "ORG_MANAGED_ROW_INDEX", payload: data });
}


