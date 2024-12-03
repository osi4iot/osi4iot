import {
	FloorsDispatch,
	IFloorsOptionToShow,
	IFloorIdToEdit,
	IFloorRowIndexToEdit
} from "./interfaces";


export function setFloorsOptionToShow(floorsDispatch: FloorsDispatch, data: IFloorsOptionToShow) {
	floorsDispatch({ type: "FLOORS_OPTION_TO_SHOW", payload: data });
}

export function setFloorIdToEdit(floorsDispatch: FloorsDispatch, data: IFloorIdToEdit) {
	floorsDispatch({ type: "FLOOR_ID_TO_EDIT", payload: data });
}

export function setFloorRowIndexToEdit(floorsDispatch: FloorsDispatch, data: IFloorRowIndexToEdit) {
	floorsDispatch({ type: "FLOOR_ROW_INDEX_TO_EDIT", payload: data });
}
