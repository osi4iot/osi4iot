import { AssetS3FolderContextProps, AssetS3FolderAction } from "./interfaces";
import {
    ASSET_S3_FOLDER_OPTIONS,
} from "../../components/PlatformAssistant/Utils/platformAssistantOptions";

export const initialState = {
    assetS3FolderOptionToShow: ASSET_S3_FOLDER_OPTIONS.TABLE,
    assetS3FolderIdToEdit: 0,
    assetS3FolderRowIndexToEdit: 0
};

export const AssetS3FolderReducer = (initialState: AssetS3FolderContextProps, action: AssetS3FolderAction) => {
    switch (action.type) {
        case "ASSET_S3_FOLDER_OPTION_TO_SHOW":
            return {
                ...initialState,
                assetS3FolderOptionToShow: action.payload.assetS3FolderOptionToShow
            };

        case "ASSET_S3_FOLDER_ID_TO_EDIT":
            return {
                ...initialState,
                assetS3FolderIdToEdit: action.payload.assetS3FolderIdToEdit
            };
        
        case "ASSET_S3_FOLDER_ROW_INDEX_TO_EDIT":
            return {
                ...initialState,
                assetS3FolderRowIndexToEdit: action.payload.assetS3FolderRowIndexToEdit
            };
        default:
            throw new Error(`Unhandled action type: ${action.type}`);
    }
};