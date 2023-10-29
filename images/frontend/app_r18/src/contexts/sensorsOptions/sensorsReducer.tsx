import { SensorsContextProps, SensorsAction } from "./interfaces";
import {
    SENSORS_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    sensorsOptionToShow: SENSORS_OPTIONS.TABLE,
    sensorIdToEdit: 0,
    sensorRowIndexToEdit: 0
};

export const SensorsReducer = (initialState: SensorsContextProps, action: SensorsAction) => {
    switch (action.type) {
        case "SENSORS_OPTION_TO_SHOW":
            return {
                ...initialState,
                sensorsOptionToShow: action.payload.sensorsOptionToShow
            };

        case "SENSOR_ID_TO_EDIT":
            return {
                ...initialState,
                sensorIdToEdit: action.payload.sensorIdToEdit
            };
        
        case "SENSOR_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                sensorRowIndexToEdit: action.payload.sensorRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};