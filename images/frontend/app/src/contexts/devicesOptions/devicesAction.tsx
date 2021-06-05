import {
	DevicesDispatch,
	IDevicesOptionToShow,
	IDeviceIdToEdit,
	IDeviceRowIndexToEdit
} from "./interfaces";


export function setDevicesOptionToShow(devicesDispatch: DevicesDispatch, data: IDevicesOptionToShow) {
	devicesDispatch({ type: "DEVICES_OPTION_TO_SHOW", payload: data });
}

export function setDeviceIdToEdit(devicesDispatch: DevicesDispatch, data: IDeviceIdToEdit) {
	devicesDispatch({ type: "DEVICE_ID_TO_EDIT", payload: data });
}

export function setDeviceRowIndexToEdit(devicesDispatch: DevicesDispatch, data: IDeviceRowIndexToEdit) {
	devicesDispatch({ type: "DEVICE_ROW_INDEX_TO_EDIT", payload: data });
}

