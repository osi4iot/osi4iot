export interface DevicesDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface DevicesContextProps {
	devicesOptionToShow: string;
	deviceIdToEdit: number;
	deviceRowIndexToEdit: number;
}

export interface DevicesActionPayload {
	devicesOptionToShow: string;
	deviceIdToEdit: number;
	deviceRowIndexToEdit: number;
}

export interface DevicesAction {
	type: string;
	payload: DevicesActionPayload;
	error: string;
}

export interface IDevicesOptionToShow {
	devicesOptionToShow: string;
}

export interface IDeviceIdToEdit {
	deviceIdToEdit: number;
}

export interface IDeviceRowIndexToEdit {
	deviceRowIndexToEdit: number;
}






