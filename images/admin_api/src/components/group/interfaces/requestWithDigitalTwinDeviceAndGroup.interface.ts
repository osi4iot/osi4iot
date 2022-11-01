import { Request } from "express";
import IDevice from "../../device/device.interface";
import IDigitalTwin from "../../digitalTwin/digitalTwin.interface";
import IGroup from "./Group.interface";

interface IRequestWithDigitalTwinDeviceAndGroup extends Request {
	digitalTwin: IDigitalTwin;
	device: IDevice;
	group: IGroup;
}

export default IRequestWithDigitalTwinDeviceAndGroup;
