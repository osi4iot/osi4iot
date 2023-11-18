import {
	SensorTypesDispatch,
	ISensorTypesOptionToShow,
	ISensorTypeIdToEdit,
	ISensorTypeRowIndexToEdit
} from "./interfaces";


export function setSensorTypesOptionToShow(sensorTypesDispatch: SensorTypesDispatch, data: ISensorTypesOptionToShow) {
	sensorTypesDispatch({ type: "SENSOR_TYPES_OPTION_TO_SHOW", payload: data });
}

export function setSensorTypeIdToEdit(sensorTypesDispatch: SensorTypesDispatch, data: ISensorTypeIdToEdit) {
	sensorTypesDispatch({ type: "SENSOR_TYPE_ID_TO_EDIT", payload: data });
}

export function setSensorTypeRowIndexToEdit(sensorTypesDispatch: SensorTypesDispatch, data: ISensorTypeRowIndexToEdit) {
	sensorTypesDispatch({ type: "SENSOR_TYPE_ROW_INDEX_TO_EDIT", payload: data });
}