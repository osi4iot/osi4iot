import { MeasurementsContextProps, MeasurementsAction } from "./interfaces";
import {
    MEASUREMENTS_OPTIONS
} from "../../components/PlatformAssistant/platformAssistantOptions";

const currentDate = new Date();

export const initialState = {
    measurementsOptionToShow: MEASUREMENTS_OPTIONS.TABLE,
    measurementTimestampToEdit: currentDate.valueOf(),
    measurementRowIndexToEdit: 0
};


export const MeasurementsReducer = (initialState: MeasurementsContextProps, action: MeasurementsAction) => {
    switch (action.type) {
        case "MEASUREMENTS_OPTION_TO_SHOW":
            return {
                ...initialState,
                measurementsOptionToShow: action.payload.measurementsOptionToShow
            };

        case "MEASUREMENT_TIMESTAMP_TO_EDIT":
            return {
                ...initialState,
                measurementTimestampToEdit: action.payload.measurementTimestampToEdit
            };
        
        case "MEASUREMENT_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                measurementRowIndexToEdit: action.payload.measurementRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};