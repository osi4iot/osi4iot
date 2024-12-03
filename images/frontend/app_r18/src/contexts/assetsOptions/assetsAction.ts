import {
	AssetsDispatch,
	IAssetsOptionToShow,
	IAssetIdToEdit,
	IAssetRowIndexToEdit,
	IAssetsPreviousOption,
	IAssetBuildingId,
	IAssetGroupId,
	IAssetInputFormData
} from "./interfaces";


export function setAssetsOptionToShow(assetsDispatch: AssetsDispatch, data: IAssetsOptionToShow) {
	assetsDispatch({ type: "ASSETS_OPTION_TO_SHOW", payload: data });
}

export function setAssetsPreviousOption(assetsDispatch: AssetsDispatch, data: IAssetsPreviousOption) {
	assetsDispatch({ type: "ASSETS_PREVIOUS_OPTION", payload: data });
}

export function setAssetIdToEdit(assetsDispatch: AssetsDispatch, data: IAssetIdToEdit) {
	assetsDispatch({ type: "ASSET_ID_TO_EDIT", payload: data });
}

export function setAssetRowIndexToEdit(assetsDispatch: AssetsDispatch, data: IAssetRowIndexToEdit) {
	assetsDispatch({ type: "ASSET_ROW_INDEX_TO_EDIT", payload: data });
}

export function setAssetBuildingId(assetsDispatch: AssetsDispatch, data: IAssetBuildingId) {
	assetsDispatch({ type: "ASSET_BUILDING_ID", payload: data });
}

export function setAssetGroupId(assetsDispatch: AssetsDispatch, data: IAssetGroupId) {
	assetsDispatch({ type: "ASSET_GROUP_ID", payload: data });
}

export function setAssetInputData(assetsDispatch: AssetsDispatch, data: IAssetInputFormData) {
	assetsDispatch({ type: "ASSET_INPUT_DATA", payload: data });
}
