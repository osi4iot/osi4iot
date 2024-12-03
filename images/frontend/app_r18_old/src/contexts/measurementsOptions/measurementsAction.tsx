import {
	MeasurementsDispatch,
	IMeasurementsOptionToShow,
	IMeasurementTimestampToEdit,
	IMeasurementRowIndexToEdit
} from "./interfaces";


export function setMeasurementsOptionToShow(measurementsDispatch: MeasurementsDispatch, data: IMeasurementsOptionToShow) {
	measurementsDispatch({ type: "MEASUREMENTS_OPTION_TO_SHOW", payload: data });
}

export function setMeasurementTimestampToEdit(measurementsDispatch: MeasurementsDispatch, data: IMeasurementTimestampToEdit) {
	measurementsDispatch({ type: "MEASUREMENT_TIMESTAMP_TO_EDIT", payload: data });
}

export function setMeasurementRowIndexToEdit(measurementsDispatch: MeasurementsDispatch, data: IMeasurementRowIndexToEdit) {
	measurementsDispatch({ type: "MEASUREMENT_ROW_INDEX_TO_EDIT", payload: data });
}

