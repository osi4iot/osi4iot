import {
	MasterDevicesDispatch,
	IMasterDevicesOptionToShow,
	IMasterDeviceIdToEdit,
	IMasterDeviceRowIndexToEdit
} from "./interfaces";


export function setMasterDevicesOptionToShow(masterDevicesDispatch: MasterDevicesDispatch, data: IMasterDevicesOptionToShow) {
	masterDevicesDispatch({ type: "MASTER_DEVICES_OPTION_TO_SHOW", payload: data });
}

export function setMasterDeviceIdToEdit(masterDevicesDispatch: MasterDevicesDispatch, data: IMasterDeviceIdToEdit) {
	masterDevicesDispatch({ type: "MASTER_DEVICE_ID_TO_EDIT", payload: data });
}

export function setMasterDeviceRowIndexToEdit(masterDevicesDispatch: MasterDevicesDispatch, data: IMasterDeviceRowIndexToEdit) {
	masterDevicesDispatch({ type: "MASTER_DEVICE_ROW_INDEX_TO_EDIT", payload: data });
}
