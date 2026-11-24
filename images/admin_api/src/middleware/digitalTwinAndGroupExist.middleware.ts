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
	if (!existingGroup) return next(new GroupNotFoundException(request, response, "id", groupId));
	// a twin of another group is not found here: the group's role must not reach it (IDOR)
	if (!existDigitalTwin || Number(existDigitalTwin.groupId) !== Number(existingGroup.id)) {
		return next(new DigitalTwinNotFoundException(request, response, "id", digitalTwinId));
	}
	request.group = { ...existingGroup };
	request.digitalTwin = { ...existDigitalTwin };
	next();
}

export default digitalTwinAndGroupExist;