import { Request } from "express";
import IGroup from "./Group.interface";

interface IRequestWithGroup extends Request {
	group: IGroup;
}

export default IRequestWithGroup;