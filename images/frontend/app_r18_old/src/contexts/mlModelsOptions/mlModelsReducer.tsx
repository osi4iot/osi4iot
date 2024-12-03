import { MlModelsContextProps, MlModelsAction } from "./interfaces";
import {
    ML_MODELS_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    mlModelsOptionToShow: ML_MODELS_OPTIONS.TABLE,
    mlModelIdToEdit: 0,
    mlModelRowIndexToEdit: 0
};

export const MlModelsReducer = (initialState: MlModelsContextProps, action: MlModelsAction) => {
    switch (action.type) {
        case "ML_MODELS_OPTION_TO_SHOW":
            return {
                ...initialState,
                mlModelsOptionToShow: action.payload.mlModelsOptionToShow
            };

        case "ML_MODEL_ID_TO_EDIT":
            return {
                ...initialState,
                mlModelIdToEdit: action.payload.mlModelIdToEdit
            };
        
        case "ML_MODEL_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                mlModelRowIndexToEdit: action.payload.mlModelRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};