import { DigitalTwinsContextProps, DigitalTwinsAction } from "./interfaces";
import {
    DIGITAL_TWINS_OPTIONS
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    digitalTwinsOptionToShow: DIGITAL_TWINS_OPTIONS.TABLE,
    digitalTwinIdToEdit: 0,
    digitalTwinRowIndexToEdit: 0
};

export const DigitalTwinsReducer = (initialState: DigitalTwinsContextProps, action: DigitalTwinsAction) => {
    switch (action.type) {
        case "DIGITAL_TWINS_OPTION_TO_SHOW":
            return {
                ...initialState,
                digitalTwinsOptionToShow: action.payload.digitalTwinsOptionToShow
            };

        case "DIGITAL_TWIN_ID_TO_EDIT":
            return {
                ...initialState,
                digitalTwinIdToEdit: action.payload.digitalTwinIdToEdit
            };
        
        case "DIGITAL_TWIN_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                digitalTwinRowIndexToEdit: action.payload.digitalTwinRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};