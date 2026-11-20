import { NextFunction, Response } from "express";
import { getGroupByProp } from "../components/group/groupDAL";
import GroupNotFoundException from "../exceptions/GroupNotFoundException";
import HttpException from "../exceptions/HttpException";
import IRequestWithGroup from "../components/group/interfaces/requestWithGroup.interface";
import { groupOwnershipProblem } from "./groupOwnership";

// The group of the route (:groupId), and that what the route names (assets, digital twins, sensors, topics, ML
// models, dashboards, S3 folders) is of that group: otherwise 404 (groupOwnership.ts)
const groupExists = async (request: IRequestWithGroup, response: Response, next: NextFunction): Promise<void> => {
	try {
		const { groupId } = request.params;
		const existingGroup = await getGroupByProp("id", groupId);
		if (!existingGroup) {
			next(new GroupNotFoundException(request, response, "id", groupId));
			return;
		}
		request.group = { ...existingGroup };
		const problem = await groupOwnershipProblem(request, Number(existingGroup.id));
		if (problem) {
			next(new HttpException(request, response, 404, problem));
			return;
		}
		next();
	} catch (error) {
		next(error);
	}
};

export default groupExists;
