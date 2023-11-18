export interface AssetTypesDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface AssetTypesContextProps {
	assetTypesOptionToShow: string;
	assetTypeIdToEdit: number;
	assetTypeRowIndexToEdit: number;
}

export interface AssetTypesActionPayload {
	assetTypesOptionToShow: string;
	assetTypeIdToEdit: number;
	assetTypeRowIndexToEdit: number;
}

export interface AssetTypesAction {
	type: string;
	payload: AssetTypesActionPayload;
	error: string;
}

export interface IAssetTypesOptionToShow {
	assetTypesOptionToShow: string;
}

export interface IAssetTypeIdToEdit {
	assetTypeIdToEdit: number;
}

export interface IAssetTypeRowIndexToEdit {
	assetTypeRowIndexToEdit: number;
}


