import { NextFunction, Response } from "express";
import { getGroupByProp } from "../components/group/groupDAL";
import GroupNotFoundException from "../exceptions/GroupNotFoundException";
import IRequestWithDeviceAndGroup from "../components/group/interfaces/requestWithDeviceAndGroup.interface";
import { getDeviceByProp } from "../components/device/deviceDAL";
import DeviceNotFoundException from "../exceptions/DeviceNotFoundException";


async function deviceAndGroupExist(
	request: IRequestWithDeviceAndGroup,
	response: Response,
	next: NextFunction
): Promise<void> {
	const { groupId, deviceId } = request.params;
	const existingGroup = await getGroupByProp("id", groupId);
	const existingDevice = await getDeviceByProp("id", deviceId);
	if (!existingGroup) next(new GroupNotFoundException("id", groupId));
	if (!existingDevice) next(new DeviceNotFoundException("id", deviceId));
	if (existingGroup && existingDevice) {
		request.group = { ...existingGroup };
		request.device = { ...existingDevice };
		next();
	}
}

export default deviceAndGroupExist;
