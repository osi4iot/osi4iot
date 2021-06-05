import { DevicesContextProps, DevicesAction } from "./interfaces";
import {
    DEVICES_OPTIONS
} from "../../components/PlatformAssistant/platformAssistantOptions";


export const initialState = {
    devicesOptionToShow: DEVICES_OPTIONS.TABLE,
    deviceIdToEdit: 0,
    deviceRowIndexToEdit: 0
};

export const DevicesReducer = (initialState: DevicesContextProps, action: DevicesAction) => {
    switch (action.type) {
        case "DEVICES_OPTION_TO_SHOW":
            return {
                ...initialState,
                devicesOptionToShow: action.payload.devicesOptionToShow
            };

        case "DEVICE_ID_TO_EDIT":
            return {
                ...initialState,
                deviceIdToEdit: action.payload.deviceIdToEdit
            };
        
        case "DEVICE_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                deviceRowIndexToEdit: action.payload.deviceRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};