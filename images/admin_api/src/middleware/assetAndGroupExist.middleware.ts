import { NextFunction, Response } from "express";
import { getGroupByProp } from "../components/group/groupDAL";
import GroupNotFoundException from "../exceptions/GroupNotFoundException";
import IRequestWithAssetAndGroup from "../components/group/interfaces/requestWithAssetAndGroup.interface";
import AsssetNotFoundException from "../exceptions/AssetNotFoundException";
import { getAssetByPropName } from "../components/asset/assetDAL";


export const assetAndGroupExist = async (
	request: IRequestWithAssetAndGroup,
	response: Response,
	next: NextFunction
): Promise<void> => {
	const { groupId, assetId } = request.params;
	const existingGroup = await getGroupByProp("id", groupId);
	const existingAssset = await getAssetByPropName("id", assetId);
	if (!existingGroup) next(new GroupNotFoundException(request, response, "id", groupId));
	if (!existingAssset) next(new AsssetNotFoundException(request, response, "id", assetId));
	if (existingGroup && existingAssset) {
		request.group = { ...existingGroup };
		request.asset = { ...existingAssset };
		next();
	}
}

