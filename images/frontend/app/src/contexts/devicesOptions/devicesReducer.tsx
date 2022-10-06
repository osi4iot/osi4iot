import { DevicesContextProps, DevicesAction } from "./interfaces";
import {
    DEVICES_OPTIONS, DEVICES_PREVIOUS_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    devicesOptionToShow: DEVICES_OPTIONS.TABLE,
    devicesPreviousOption: DEVICES_PREVIOUS_OPTIONS.TABLE,
    deviceIdToEdit: 0,
    deviceRowIndexToEdit: 0,
    deviceBuildingId: 0,
    deviceGroupId: 0,
    deviceInputFormData: {
        groupId: 0,
        name: "",
        description: "",
        type: "Generic",
        iconRadio: 1.0,
        longitude: 0,
        latitude: 0,
        mqttActionAllowed: "Pub & Sub"
    }
};

export const DevicesReducer = (initialState: DevicesContextProps, action: DevicesAction) => {
    switch (action.type) {
        case "DEVICES_OPTION_TO_SHOW":
            return {
                ...initialState,
                devicesOptionToShow: action.payload.devicesOptionToShow
            };

        case "DEVICES_PREVIOUS_OPTION":
            return {
                ...initialState,
                devicesPreviousOption: action.payload.devicesPreviousOption
            };

        case "DEVICE_ID_TO_EDIT":
            return {
                ...initialState,
                deviceIdToEdit: action.payload.deviceIdToEdit
            };

        case "DEVICE_BUILDING_ID":
            return {
                ...initialState,
                deviceBuildingId: action.payload.deviceBuildingId
            };

        case "DEVICE_GROUP_ID":
            return {
                ...initialState,
                deviceGroupId: action.payload.deviceGroupId
            };

        case "DEVICE_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                deviceRowIndexToEdit: action.payload.deviceRowIndexToEdit
            };

        case "DEVICE_INPUT_DATA":
            return {
                ...initialState,
                deviceInputFormData: action.payload.deviceInputFormData
            };
        
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};