import { NextFunction, Response } from "express";
import OrganizationNotFoundException from "../exceptions/OrganizationNotFoundException";
import IRequestWithOrganization from "../components/organization/interfaces/requestWithOrganization.interface";
import { getOrganizationByProp } from "../components/organization/organizationDAL";


const organizationExists = async (
	request: IRequestWithOrganization,
	response: Response,
	next: NextFunction
): Promise<void> => {
	const { orgId } = request.params;
	const existingOrganization = await getOrganizationByProp("id", orgId);
	if (!existingOrganization) {
		next(new OrganizationNotFoundException(request, response, "id", orgId));
	} else {
		request.organization = { ...existingOrganization };
		next();
	}
}

export default organizationExists;
