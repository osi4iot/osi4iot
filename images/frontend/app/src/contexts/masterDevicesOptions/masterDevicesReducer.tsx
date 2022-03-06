import { MasterDevicesContextProps, MasterDevicesAction } from "./interfaces";
import {
    MASTER_DEVICES_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    masterDevicesOptionToShow: MASTER_DEVICES_OPTIONS.TABLE,
    masterDeviceIdToEdit: 0,
    masterDeviceRowIndexToEdit: 0
};

export const MasterDevicesReducer = (initialState: MasterDevicesContextProps, action: MasterDevicesAction) => {
    switch (action.type) {
        case "MASTER_DEVICES_OPTION_TO_SHOW":
            return {
                ...initialState,
                masterDevicesOptionToShow: action.payload.masterDevicesOptionToShow
            };

        case "MASTER_DEVICE_ID_TO_EDIT":
            return {
                ...initialState,
                masterDeviceIdToEdit: action.payload.masterDeviceIdToEdit
            };
        
        case "MASTER_DEVICE_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                masterDeviceRowIndexToEdit: action.payload.masterDeviceRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};