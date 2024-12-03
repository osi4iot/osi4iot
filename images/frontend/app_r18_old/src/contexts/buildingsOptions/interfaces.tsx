export interface BuildingsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface BuildingsContextProps {
	buildingsOptionToShow: string;
	buildingIdToEdit: number;
	buildingRowIndexToEdit: number;
}

export interface BuildingsActionPayload {
	buildingsOptionToShow: string;
	buildingIdToEdit: number;
	buildingRowIndexToEdit: number;
}

export interface BuildingsAction {
	type: string;
	payload: BuildingsActionPayload;
	error: string;
}

export interface IBuildingsOptionToShow {
	buildingsOptionToShow: string;
}

export interface IBuildingIdToEdit {
	buildingIdToEdit: number;
}

export interface IBuildingRowIndexToEdit {
	buildingRowIndexToEdit: number;
}






