import { AssetTypesContextProps, AssetTypesAction } from "./interfaces";
import {
    ASSET_TYPES_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    assetTypesOptionToShow: ASSET_TYPES_OPTIONS.TABLE,
    assetTypeIdToEdit: 0,
    assetTypeRowIndexToEdit: 0
};

export const AssetTypesReducer = (initialState: AssetTypesContextProps, action: AssetTypesAction) => {
    switch (action.type) {
        case "ASSET_TYPES_OPTION_TO_SHOW":
            return {
                ...initialState,
                assetTypesOptionToShow: action.payload.assetTypesOptionToShow
            };

        case "ASSET_TYPE_ID_TO_EDIT":
            return {
                ...initialState,
                assetTypeIdToEdit: action.payload.assetTypeIdToEdit
            };
        
        case "ASSET_TYPE_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                assetTypeRowIndexToEdit: action.payload.assetTypeRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};