export interface SensorsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface SensorsContextProps {
	sensorsOptionToShow: string;
	sensorIdToEdit: number;
	sensorRowIndexToEdit: number;
}

export interface SensorsActionPayload {
	sensorsOptionToShow: string;
	sensorIdToEdit: number;
	sensorRowIndexToEdit: number;
}

export interface SensorsAction {
	type: string;
	payload: SensorsActionPayload;
	error: string;
}

export interface ISensorsOptionToShow {
	sensorsOptionToShow: string;
}

export interface ISensorIdToEdit {
	sensorIdToEdit: number;
}

export interface ISensorRowIndexToEdit {
	sensorRowIndexToEdit: number;
}
