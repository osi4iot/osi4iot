import {
    AssetS3FolderDispatch,
    IAssetS3FolderOptionToShow,
    IAssetS3FolderIdToEdit,
    IAssetS3FolderRowIndexToEdit
} from "./interfaces";


export function setAssetS3FolderOptionToShow(assetS3FolderDispatch: AssetS3FolderDispatch, data: IAssetS3FolderOptionToShow) {
    assetS3FolderDispatch({ type: "ASSET_S3_FOLDER_OPTION_TO_SHOW", payload: data });
}

export function setAssetS3FolderIdToEdit(assetS3FolderDispatch: AssetS3FolderDispatch, data: IAssetS3FolderIdToEdit) {
    assetS3FolderDispatch({ type: "ASSET_S3_FOLDER_ID_TO_EDIT", payload: data });
}

export function setAssetS3FolderRowIndexToEdit(assetS3FolderDispatch: AssetS3FolderDispatch, data: IAssetS3FolderRowIndexToEdit) {
    assetS3FolderDispatch({ type: "ASSET_S3_FOLDER_ROW_INDEX_TO_EDIT", payload: data });
}