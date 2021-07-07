import { FloorsContextProps, FloorsAction } from "./interfaces";
import {
    FLOORS_OPTIONS
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    floorsOptionToShow: FLOORS_OPTIONS.TABLE,
    floorIdToEdit: 0,
    floorRowIndexToEdit: 0
};

export const FloorsReducer = (initialState: FloorsContextProps, action: FloorsAction) => {
    switch (action.type) {
        case "FLOORS_OPTION_TO_SHOW":
            return {
                ...initialState,
                floorsOptionToShow: action.payload.floorsOptionToShow
            };

        case "FLOOR_ID_TO_EDIT":
            return {
                ...initialState,
                floorIdToEdit: action.payload.floorIdToEdit
            };
        
        case "FLOOR_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                floorRowIndexToEdit: action.payload.floorRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};