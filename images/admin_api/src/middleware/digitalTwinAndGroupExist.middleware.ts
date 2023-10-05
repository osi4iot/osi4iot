import { NextFunction, Response } from "express";
import { getGroupByProp } from "../components/group/groupDAL";
import GroupNotFoundException from "../exceptions/GroupNotFoundException";
import { getDigitalTwinByProp } from "../components/digitalTwin/digitalTwinDAL";
import DigitalTwinNotFoundException from "../exceptions/DigitalTwinNotFoundException";
import IRequestWithDigitalTwinAndGroup from "../components/group/interfaces/requestWithDigitalTwinAndGroup.interface";


const digitalTwinAndGroupExist = async (
	request: IRequestWithDigitalTwinAndGroup,
	response: Response,
	next: NextFunction
): Promise<void> => {
	const { groupId, digitalTwinId } = request.params;
	const existingGroup = await getGroupByProp("id", groupId);
	const existDigitalTwin = await getDigitalTwinByProp("id", digitalTwinId);
	if (!existingGroup) next(new GroupNotFoundException(request, response, "id", groupId));
	if (!existDigitalTwin) next(new DigitalTwinNotFoundException(request, response, "id", digitalTwinId));
	if (existingGroup && existDigitalTwin) {
		request.group = { ...existingGroup };
		request.digitalTwin = { ...existDigitalTwin };
		next();
	}
}

export default digitalTwinAndGroupExist;