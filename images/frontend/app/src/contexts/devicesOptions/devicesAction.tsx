import {
	DevicesDispatch,
	IDevicesOptionToShow,
	IDeviceIdToEdit,
	IDeviceRowIndexToEdit,
	IDevicesPreviousOption,
	IDeviceBuildingId,
	IDeviceGroupId,
	IDeviceInputFormData
} from "./interfaces";


export function setDevicesOptionToShow(devicesDispatch: DevicesDispatch, data: IDevicesOptionToShow) {
	devicesDispatch({ type: "DEVICES_OPTION_TO_SHOW", payload: data });
}

export function setDevicesPreviousOption(devicesDispatch: DevicesDispatch, data: IDevicesPreviousOption) {
	devicesDispatch({ type: "DEVICES_PREVIOUS_OPTION", payload: data });
}

export function setDeviceIdToEdit(devicesDispatch: DevicesDispatch, data: IDeviceIdToEdit) {
	devicesDispatch({ type: "DEVICE_ID_TO_EDIT", payload: data });
}

export function setDeviceRowIndexToEdit(devicesDispatch: DevicesDispatch, data: IDeviceRowIndexToEdit) {
	devicesDispatch({ type: "DEVICE_ROW_INDEX_TO_EDIT", payload: data });
}

export function setDeviceBuildingId(devicesDispatch: DevicesDispatch, data: IDeviceBuildingId) {
	devicesDispatch({ type: "DEVICE_BUILDING_ID", payload: data });
}

export function setDeviceGroupId(devicesDispatch: DevicesDispatch, data: IDeviceGroupId) {
	devicesDispatch({ type: "DEVICE_GROUP_ID", payload: data });
}

export function setDeviceInputData(devicesDispatch: DevicesDispatch, data: IDeviceInputFormData) {
	devicesDispatch({ type: "DEVICE_INPUT_DATA", payload: data });
}

