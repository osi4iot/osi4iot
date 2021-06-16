import { Request } from "express";
import IOrganization from "./organization.interface";

interface IRequestWithOrganization extends Request {
  organization: IOrganization;
}

export default IRequestWithOrganization;
