import { NodeRedInstancesContextProps, NodeRedInstancesAction } from "./interfaces";
import {
    NODERED_INSTANCES_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    nodeRedInstancesOptionToShow: NODERED_INSTANCES_OPTIONS.TABLE,
};

export const NodeRedInstancesReducer = (initialState: NodeRedInstancesContextProps, action: NodeRedInstancesAction) => {
    switch (action.type) {
        case "NODERED_INSTANCES_OPTION_TO_SHOW":
            return {
                ...initialState,
                nodeRedInstancesOptionToShow: action.payload.nodeRedInstancesOptionToShow
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};