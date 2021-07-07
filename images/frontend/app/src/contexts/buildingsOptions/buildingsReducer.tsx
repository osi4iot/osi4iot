import { BuildingsContextProps, BuildingsAction } from "./interfaces";
import {
    BUILDINGS_OPTIONS
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    buildingsOptionToShow: BUILDINGS_OPTIONS.TABLE,
    buildingIdToEdit: 0,
    buildingRowIndexToEdit: 0
};

export const BuildingsReducer = (initialState: BuildingsContextProps, action: BuildingsAction) => {
    switch (action.type) {
        case "BUILDINGS_OPTION_TO_SHOW":
            return {
                ...initialState,
                buildingsOptionToShow: action.payload.buildingsOptionToShow
            };

        case "BUILDING_ID_TO_EDIT":
            return {
                ...initialState,
                buildingIdToEdit: action.payload.buildingIdToEdit
            };
        
        case "BUILDING_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                buildingRowIndexToEdit: action.payload.buildingRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};