import { NextFunction, Response } from "express";
import { getGroupByProp } from "../components/group/groupDAL";
import GroupNotFoundException from "../exceptions/GroupNotFoundException";
import IRequestWithGroup from "../components/group/interfaces/requestWithGroup.interface";


async function groupExists(
	request: IRequestWithGroup,
	response: Response,
	next: NextFunction
): Promise<void> {
	const { groupId } = request.params;
	const existingGroup = await getGroupByProp("id", groupId);
	if (!existingGroup) {
		next(new GroupNotFoundException("id",  groupId));
	} else {
		request.group = { ...existingGroup };
		next();
	}
}

export default groupExists;
