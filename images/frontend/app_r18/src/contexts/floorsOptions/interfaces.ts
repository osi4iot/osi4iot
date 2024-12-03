export interface FloorsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface FloorsContextProps {
	floorsOptionToShow: string;
	floorIdToEdit: number;
	floorRowIndexToEdit: number;
}

export interface FloorsActionPayload {
	floorsOptionToShow: string;
	floorIdToEdit: number;
	floorRowIndexToEdit: number;
}

export interface FloorsAction {
	type: string;
	payload: FloorsActionPayload;
	error: string;
}

export interface IFloorsOptionToShow {
	floorsOptionToShow: string;
}

export interface IFloorIdToEdit {
	floorIdToEdit: number;
}

export interface IFloorRowIndexToEdit {
	floorRowIndexToEdit: number;
}

