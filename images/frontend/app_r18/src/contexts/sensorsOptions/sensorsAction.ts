import {
	SensorsDispatch,
	ISensorsOptionToShow,
	ISensorIdToEdit,
	ISensorRowIndexToEdit
} from "./interfaces";


export function setSensorsOptionToShow(sensorsDispatch: SensorsDispatch, data: ISensorsOptionToShow) {
	sensorsDispatch({ type: "SENSORS_OPTION_TO_SHOW", payload: data });
}

export function setSensorIdToEdit(sensorsDispatch: SensorsDispatch, data: ISensorIdToEdit) {
	sensorsDispatch({ type: "SENSOR_ID_TO_EDIT", payload: data });
}

export function setSensorRowIndexToEdit(sensorsDispatch: SensorsDispatch, data: ISensorRowIndexToEdit) {
	sensorsDispatch({ type: "SENSOR_ROW_INDEX_TO_EDIT", payload: data });
}