import {
	OrgsDispatch,
	IOrgsOptionToShow,
	IOrgIdToEdit,
} from "./interfaces";


export function setOrgsOptionToShow(orgsDispatch: OrgsDispatch, data: IOrgsOptionToShow) {
	orgsDispatch({ type: "ORGS_OPTION_TO_SHOW", payload: data });
}

export function setOrgIdToEdit(orgsDispatch: OrgsDispatch, data: IOrgIdToEdit) {
	orgsDispatch({ type: "ORG_ID_TO_EDIT", payload: data });
}

