import { AssetsContextProps, AssetsAction } from "./interfaces";
import {
    ASSETS_OPTIONS, ASSETS_PREVIOUS_OPTIONS
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";


export const initialState = {
    assetsOptionToShow: ASSETS_OPTIONS.TABLE,
    assetsPreviousOption: ASSETS_PREVIOUS_OPTIONS.TABLE,
    assetIdToEdit: 0,
    assetRowIndexToEdit: 0,
    assetBuildingId: 0,
    assetGroupId: 0,
    assetInputFormData: {
        groupId: 1,
        description: "",
        assetType: "generic",
        assetUid: "",
        iconRadio: 1.0,
        longitude: 0,
        latitude: 0,
        geolocationMode: "static"
    }
};

export const AssetsReducer = (initialState: AssetsContextProps, action: AssetsAction) => {
    switch (action.type) {
        case "ASSETS_OPTION_TO_SHOW":
            return {
                ...initialState,
                assetsOptionToShow: action.payload.assetsOptionToShow
            };

        case "ASSETS_PREVIOUS_OPTION":
            return {
                ...initialState,
                assetsPreviousOption: action.payload.assetsPreviousOption
            };

        case "ASSET_ID_TO_EDIT":
            return {
                ...initialState,
                assetIdToEdit: action.payload.assetIdToEdit
            };

        case "ASSET_BUILDING_ID":
            return {
                ...initialState,
                assetBuildingId: action.payload.assetBuildingId
            };

        case "ASSET_GROUP_ID":
            return {
                ...initialState,
                assetGroupId: action.payload.assetGroupId
            };

        case "ASSET_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                assetRowIndexToEdit: action.payload.assetRowIndexToEdit
            };

        case "ASSET_INPUT_DATA":
            return {
                ...initialState,
                assetInputFormData: action.payload.assetInputFormData
            };
        
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};