import { NextFunction, Response } from "express";
import { getGroupByProp } from "../components/group/groupDAL";
import GroupNotFoundException from "../exceptions/GroupNotFoundException";
import { getDeviceByProp } from "../components/device/deviceDAL";
import DeviceNotFoundException from "../exceptions/DeviceNotFoundException";
import { getDigitalTwinByProp } from "../components/digitalTwin/digitalTwinDAL";
import DigitalTwinNotFoundException from "../exceptions/DigitalTwinNotFoundException";
import IRequestWithDigitalTwinDeviceAndGroup from "../components/group/interfaces/requestWithDigitalTwinDeviceAndGroup.interface";


const digitalTwinDeviceGroupAndExist = async (
	request: IRequestWithDigitalTwinDeviceAndGroup,
	response: Response,
	next: NextFunction
): Promise<void> => {
	const { groupId, deviceId, digitalTwinId } = request.params;
	const existingGroup = await getGroupByProp("id", groupId);
	const existingDevice = await getDeviceByProp("id", deviceId);
	const existDigitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
	if (!existingGroup) next(new GroupNotFoundException("id", groupId));
	if (!existingDevice) next(new DeviceNotFoundException("id", deviceId));
	if (!existDigitalTwin) next(new DigitalTwinNotFoundException("id", digitalTwinId));
	if (existingGroup && existingDevice && existDigitalTwin) {
		request.group = { ...existingGroup };
		request.device = { ...existingDevice };
		request.digitalTwin = { ...existDigitalTwin };
		next();
	}
}

export default digitalTwinDeviceGroupAndExist;