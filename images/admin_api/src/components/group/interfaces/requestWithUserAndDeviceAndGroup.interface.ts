import { Request } from "express";
import IUser from "../../user/interfaces/User.interface";
import IDevice from "../../device/device.interface";
import IGroup from "./Group.interface";

interface IRequestWithUserAndDeviceAndGroup extends Request {
	user: IUser;
	device: IDevice;
	group: IGroup;
}

export default IRequestWithUserAndDeviceAndGroup;
