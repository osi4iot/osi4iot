export interface AssetS3FolderDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface AssetS3FolderContextProps {
	assetS3FolderOptionToShow: string;
	assetS3FolderIdToEdit: number;
	assetS3FolderRowIndexToEdit: number;
}

export interface AssetS3FolderActionPayload {
	assetS3FolderOptionToShow: string;
	assetS3FolderIdToEdit: number;
	assetS3FolderRowIndexToEdit: number;
}

export interface AssetS3FolderAction {
	type: string;
	payload: AssetS3FolderActionPayload;
	error: string;
}

export interface IAssetS3FolderOptionToShow {
	assetS3FolderOptionToShow: string;
}

export interface IAssetS3FolderIdToEdit {
	assetS3FolderIdToEdit: number;
}

export interface IAssetS3FolderRowIndexToEdit {
	assetS3FolderRowIndexToEdit: number;
}
