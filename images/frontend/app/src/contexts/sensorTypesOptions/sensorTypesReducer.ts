import { SensorTypesContextProps, SensorTypesAction } from "./interfaces";
import {
    SENSOR_TYPES_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    sensorTypesOptionToShow: SENSOR_TYPES_OPTIONS.TABLE,
    sensorTypeIdToEdit: 0,
    sensorTypeRowIndexToEdit: 0
};

export const SensorTypesReducer = (initialState: SensorTypesContextProps, action: SensorTypesAction) => {
    switch (action.type) {
        case "SENSOR_TYPES_OPTION_TO_SHOW":
            return {
                ...initialState,
                sensorTypesOptionToShow: action.payload.sensorTypesOptionToShow
            };

        case "SENSOR_TYPE_ID_TO_EDIT":
            return {
                ...initialState,
                sensorTypeIdToEdit: action.payload.sensorTypeIdToEdit
            };
        
        case "SENSOR_TYPE_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                sensorTypeRowIndexToEdit: action.payload.sensorTypeRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};