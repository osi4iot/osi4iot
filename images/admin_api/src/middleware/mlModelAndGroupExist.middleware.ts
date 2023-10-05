import { NextFunction, Response } from "express";
import { getGroupByProp } from "../components/group/groupDAL";
import GroupNotFoundException from "../exceptions/GroupNotFoundException";
import { getMLModelByProp } from "../components/ml_model/ml_modelDAL";
import MLModelNotFoundException from "../exceptions/MLModelNotFoundException";
import IRequestWithMLModelAndGroup from "../components/ml_model/requestWithMLModelAndGroup.interface";


const mlModelAndGroupExist = async (
	request: IRequestWithMLModelAndGroup,
	response: Response,
	next: NextFunction
): Promise<void> => {
	const { groupId, mlModelId } = request.params;
	const existingGroup = await getGroupByProp("id", groupId);
	const existMlModel = await getMLModelByProp("id", mlModelId);
	if (!existingGroup) next(new GroupNotFoundException(request, response, "id", groupId));
	if (!existMlModel) next(new MLModelNotFoundException(request, response, "id", mlModelId));
	if (existingGroup && existMlModel) {
		request.group = { ...existingGroup };
		request.mlModel = { ...existMlModel };
		next();
	}
}

export default mlModelAndGroupExist;
