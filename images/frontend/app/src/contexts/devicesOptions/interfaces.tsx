export interface DevicesDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}


export interface IDeviceInputData {
	groupId: number | string;
	deviceUid: string;
	type: string;
	iconRadio: number;
	longitude: number;
	latitude: number;
	mqttAccessControl: string;
}

export interface DevicesContextProps {
	devicesOptionToShow: string;
	devicesPreviousOption: string;
	deviceIdToEdit: number;
	deviceRowIndexToEdit: number;
	deviceBuildingId: number;
	deviceGroupId: number;
	deviceInputFormData: IDeviceInputData;
}

export interface DevicesActionPayload {
	devicesOptionToShow: string;
	devicesPreviousOption: string;
	deviceIdToEdit: number;
	deviceRowIndexToEdit: number;
	deviceBuildingId: number;
	deviceGroupId: number;
	deviceInputFormData: IDeviceInputData;
}

export interface DevicesAction {
	type: string;
	payload: DevicesActionPayload;
	error: string;
}

export interface IDeviceInputFormData {
	deviceInputFormData: IDeviceInputData;
}


export interface IDevicesOptionToShow {
	devicesOptionToShow: string;
}

export interface IDevicesPreviousOption {
	devicesPreviousOption: string;
}

export interface IDeviceIdToEdit {
	deviceIdToEdit: number;
}

export interface IDeviceRowIndexToEdit {
	deviceRowIndexToEdit: number;
}

export interface IDeviceBuildingId {
	deviceBuildingId: number;
}

export interface IDeviceGroupId {
	deviceGroupId: number;
}








