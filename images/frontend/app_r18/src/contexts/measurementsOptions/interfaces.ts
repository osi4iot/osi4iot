export interface MeasurementsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface MeasurementsContextProps {
	measurementsOptionToShow: string;
	measurementTimestampToEdit: number;
	measurementRowIndexToEdit: number;
}

export interface MeasurementsActionPayload {
	measurementsOptionToShow: string;
	measurementTimestampToEdit: number;
	measurementRowIndexToEdit: number;
}

export interface MeasurementsAction {
	type: string;
	payload: MeasurementsActionPayload;
	error: string;
}

export interface IMeasurementsOptionToShow {
	measurementsOptionToShow: string;
}

export interface IMeasurementTimestampToEdit {
	measurementTimestampToEdit: number;
}

export interface IMeasurementRowIndexToEdit {
	measurementRowIndexToEdit: number;
}