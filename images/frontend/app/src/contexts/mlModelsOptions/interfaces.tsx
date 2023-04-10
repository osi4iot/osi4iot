export interface MlModelsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface MlModelsContextProps {
	mlModelsOptionToShow: string;
	mlModelIdToEdit: number;
	mlModelRowIndexToEdit: number;
}

export interface MlModelsActionPayload {
	mlModelsOptionToShow: string;
	mlModelIdToEdit: number;
	mlModelRowIndexToEdit: number;
}

export interface MlModelsAction {
	type: string;
	payload: MlModelsActionPayload;
	error: string;
}

export interface IMlModelsOptionToShow {
	mlModelsOptionToShow: string;
}

export interface IMlModelIdToEdit {
	mlModelIdToEdit: number;
}

export interface IMlModelRowIndexToEdit {
	mlModelRowIndexToEdit: number;
}