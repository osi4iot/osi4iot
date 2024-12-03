export interface DigitalTwinsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface DigitalTwinsContextProps {
	digitalTwinsOptionToShow: string;
	digitalTwinIdToEdit: number;
	digitalTwinRowIndexToEdit: number;
}

export interface DigitalTwinsActionPayload {
	digitalTwinsOptionToShow: string;
	digitalTwinIdToEdit: number;
	digitalTwinRowIndexToEdit: number;
}

export interface DigitalTwinsAction {
	type: string;
	payload: DigitalTwinsActionPayload;
	error: string;
}

export interface IDigitalTwinsOptionToShow {
	digitalTwinsOptionToShow: string;
}

export interface IDigitalTwinIdToEdit {
	digitalTwinIdToEdit: number;
}

export interface IDigitalTwinRowIndexToEdit {
	digitalTwinRowIndexToEdit: number;
}
