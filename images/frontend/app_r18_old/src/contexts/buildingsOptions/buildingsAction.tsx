import {
	BuildingsDispatch,
	IBuildingsOptionToShow,
	IBuildingIdToEdit,
	IBuildingRowIndexToEdit
} from "./interfaces";


export function setBuildingsOptionToShow(buildingsDispatch: BuildingsDispatch, data: IBuildingsOptionToShow) {
	buildingsDispatch({ type: "BUILDINGS_OPTION_TO_SHOW", payload: data });
}

export function setBuildingIdToEdit(buildingsDispatch: BuildingsDispatch, data: IBuildingIdToEdit) {
	buildingsDispatch({ type: "BUILDING_ID_TO_EDIT", payload: data });
}

export function setBuildingRowIndexToEdit(buildingsDispatch: BuildingsDispatch, data: IBuildingRowIndexToEdit) {
	buildingsDispatch({ type: "BUILDING_ROW_INDEX_TO_EDIT", payload: data });
}

