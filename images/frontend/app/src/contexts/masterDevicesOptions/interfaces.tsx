export interface MasterDevicesDispatch {
	(arg0: { type: string; payload?: any; error?: any }): void;
}

export interface MasterDevicesContextProps {
	masterDevicesOptionToShow: string;
}

export interface MasterDevicesActionPayload {
	masterDevicesOptionToShow: string;
}

export interface MasterDevicesAction {
	type: string;
	payload: MasterDevicesActionPayload;
	error: string;
}

export interface IMasterDevicesOptionToShow {
	masterDevicesOptionToShow: string;
}

