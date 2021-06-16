import { Request } from "express";
import IUser from "../../user/interfaces/User.interface";
import IOrganization from "./organization.interface";

interface IRequestWithOrganizationAndUser extends Request {
	organization: IOrganization;
	user: IUser;
}

export default IRequestWithOrganizationAndUser;