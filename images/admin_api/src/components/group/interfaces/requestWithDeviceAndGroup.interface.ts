import { Request } from "express";
import IDevice from "../../device/device.interface";
import IGroup from "./Group.interface";

interface IRequestWithDeviceAndGroup extends Request {
	device: IDevice;
	group: IGroup;
}

export default IRequestWithDeviceAndGroup;
