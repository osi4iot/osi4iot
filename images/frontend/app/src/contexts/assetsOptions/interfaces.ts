export interface AssetsDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}


export interface IAssetInputData {
	orgAcronym: string;
	orgId: number;
	groupAcronym: string;
	groupId: number;
	assetType: string;
	assetUid: string;
	description: string;
	iconRadio: number;
	iconSizeFactor: number;
	longitude: number;
	latitude: number;
	iconSvgString: string;
}

export interface AssetsContextProps {
	assetsOptionToShow: string;
	assetsPreviousOption: string;
	assetIdToEdit: number;
	assetRowIndexToEdit: number;
	assetBuildingId: number;
	assetGroupId: number;
	assetInputFormData: IAssetInputData;
}

export interface AssetsActionPayload {
	assetsOptionToShow: string;
	assetsPreviousOption: string;
	assetIdToEdit: number;
	assetRowIndexToEdit: number;
	assetBuildingId: number;
	assetGroupId: number;
	assetInputFormData: IAssetInputData;
}

export interface AssetsAction {
	type: string;
	payload: AssetsActionPayload;
	error: string;
}

export interface IAssetInputFormData {
	assetInputFormData: IAssetInputData;
}


export interface IAssetsOptionToShow {
	assetsOptionToShow: string;
}

export interface IAssetsPreviousOption {
	assetsPreviousOption: string;
}

export interface IAssetIdToEdit {
	assetIdToEdit: number;
}

export interface IAssetRowIndexToEdit {
	assetRowIndexToEdit: number;
}

export interface IAssetBuildingId {
	assetBuildingId: number;
}

export interface IAssetGroupId {
	assetGroupId: number;
}
