import { MasterDevicesContextProps, MasterDevicesAction } from "./interfaces";
import {
    MASTER_DEVICES_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    masterDevicesOptionToShow: MASTER_DEVICES_OPTIONS.TABLE,
};

export const MasterDevicesReducer = (initialState: MasterDevicesContextProps, action: MasterDevicesAction) => {
    switch (action.type) {
        case "MASTER_DEVICES_OPTION_TO_SHOW":
            return {
                ...initialState,
                masterDevicesOptionToShow: action.payload.masterDevicesOptionToShow
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};