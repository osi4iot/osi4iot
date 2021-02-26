import { Request } from "express";

interface Organization {
  id: number;
  name: string;
}

interface IRequestWithOrganization extends Request {
  organization: Organization;
}

export default IRequestWithOrganization;
