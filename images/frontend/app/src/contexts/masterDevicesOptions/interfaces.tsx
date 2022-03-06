export interface MasterDevicesDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface MasterDevicesContextProps {
	masterDevicesOptionToShow: string;
	masterDeviceIdToEdit: number;
	masterDeviceRowIndexToEdit: number;
}

export interface MasterDevicesActionPayload {
	masterDevicesOptionToShow: string;
	masterDeviceIdToEdit: number;
	masterDeviceRowIndexToEdit: number;
}

export interface MasterDevicesAction {
	type: string;
	payload: MasterDevicesActionPayload;
	error: string;
}

export interface IMasterDevicesOptionToShow {
	masterDevicesOptionToShow: string;
}

export interface IMasterDeviceIdToEdit {
	masterDeviceIdToEdit: number;
}

export interface IMasterDeviceRowIndexToEdit {
	masterDeviceRowIndexToEdit: number;
}
