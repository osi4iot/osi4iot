import {
	DevicesDispatch,
	IDevicesOptionToShow,
	IDeviceIdToEdit,
} from "./interfaces";


export function setDevicesOptionToShow(devicesDispatch: DevicesDispatch, data: IDevicesOptionToShow) {
	devicesDispatch({ type: "DEVICES_OPTION_TO_SHOW", payload: data });
}

export function setDeviceIdToEdit(devicesDispatch: DevicesDispatch, data: IDeviceIdToEdit) {
	devicesDispatch({ type: "DEVICE_ID_TO_EDIT", payload: data });
}
