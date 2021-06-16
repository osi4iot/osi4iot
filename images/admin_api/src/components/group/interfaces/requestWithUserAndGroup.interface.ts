import { Request } from "express";
import IUser from "../../user/interfaces/User.interface";
import IGroup from "./Group.interface";

interface IRequestWithUserAndGroup extends Request {
  user: IUser;
  group: IGroup;
}

export default IRequestWithUserAndGroup;
