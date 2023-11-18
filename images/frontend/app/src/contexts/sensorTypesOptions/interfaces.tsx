export interface SensorTypesDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface SensorTypesContextProps {
	sensorTypesOptionToShow: string;
	sensorTypeIdToEdit: number;
	sensorTypeRowIndexToEdit: number;
}

export interface SensorTypesActionPayload {
	sensorTypesOptionToShow: string;
	sensorTypeIdToEdit: number;
	sensorTypeRowIndexToEdit: number;
}

export interface SensorTypesAction {
	type: string;
	payload: SensorTypesActionPayload;
	error: string;
}

export interface ISensorTypesOptionToShow {
	sensorTypesOptionToShow: string;
}

export interface ISensorTypeIdToEdit {
	sensorTypeIdToEdit: number;
}

export interface ISensorTypeRowIndexToEdit {
	sensorTypeRowIndexToEdit: number;
}
