import { NextFunction, Response } from "express";
import { getGroupByProp } from "../components/group/groupDAL";
import GroupNotFoundException from "../exceptions/GroupNotFoundException";
import { getDigitalTwinByProp } from "../components/digitalTwin/digitalTwinDAL";
import DigitalTwinNotFoundException from "../exceptions/DigitalTwinNotFoundException";
import IRequestWithDigitalTwinDeviceAndGroup from "../components/group/interfaces/requestWithDigitalTwinDeviceAndGroup.interface";


const digitalTwinAndGroupExist = async (
	request: IRequestWithDigitalTwinDeviceAndGroup,
	response: Response,
	next: NextFunction
): Promise<void> => {
	const { groupId, digitalTwinId } = request.params;
	const existingGroup = await getGroupByProp("id", groupId);
	const existDigitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
	if (!existingGroup) next(new GroupNotFoundException("id", groupId));
	if (!existDigitalTwin) next(new DigitalTwinNotFoundException("id", digitalTwinId));
	if (existingGroup && existDigitalTwin) {
		request.group = { ...existingGroup };
		request.digitalTwin = { ...existDigitalTwin };
		next();
	}
}

export default digitalTwinAndGroupExist;