import {
	MasterDevicesDispatch,
	IMasterDevicesOptionToShow,
} from "./interfaces";


export function setMasterDevicesOptionToShow(masterDevicesDispatch: MasterDevicesDispatch, data: IMasterDevicesOptionToShow) {
	masterDevicesDispatch({ type: "MASTER_DEVICES_OPTION_TO_SHOW", payload: data });
}
