import {
	AssetTypesDispatch,
	IAssetTypesOptionToShow,
	IAssetTypeIdToEdit,
	IAssetTypeRowIndexToEdit
} from "./interfaces";


export function setAssetTypesOptionToShow(assetTypesDispatch: AssetTypesDispatch, data: IAssetTypesOptionToShow) {
	assetTypesDispatch({ type: "ASSET_TYPES_OPTION_TO_SHOW", payload: data });
}

export function setAssetTypeIdToEdit(assetTypesDispatch: AssetTypesDispatch, data: IAssetTypeIdToEdit) {
	assetTypesDispatch({ type: "ASSET_TYPE_ID_TO_EDIT", payload: data });
}

export function setAssetTypeRowIndexToEdit(assetTypesDispatch: AssetTypesDispatch, data: IAssetTypeRowIndexToEdit) {
	assetTypesDispatch({ type: "ASSET_TYPE_ROW_INDEX_TO_EDIT", payload: data });
}