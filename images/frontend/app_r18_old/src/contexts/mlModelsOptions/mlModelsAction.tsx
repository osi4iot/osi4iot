import {
	MlModelsDispatch,
	IMlModelsOptionToShow,
	IMlModelIdToEdit,
	IMlModelRowIndexToEdit
} from "./interfaces";


export function setMlModelsOptionToShow(mlModelsDispatch: MlModelsDispatch, data: IMlModelsOptionToShow) {
	mlModelsDispatch({ type: "ML_MODELS_OPTION_TO_SHOW", payload: data });
}

export function setMlModelIdToEdit(mlModelsDispatch: MlModelsDispatch, data: IMlModelIdToEdit) {
	mlModelsDispatch({ type: "ML_MODEL_ID_TO_EDIT", payload: data });
}

export function setMlModelRowIndexToEdit(mlModelsDispatch: MlModelsDispatch, data: IMlModelRowIndexToEdit) {
	mlModelsDispatch({ type: "ML_MODEL_ROW_INDEX_TO_EDIT", payload: data });
}

