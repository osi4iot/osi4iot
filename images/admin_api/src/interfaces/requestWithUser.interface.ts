import { Request } from "express";
import IUser from "../components/user/User.interface";

interface IRequestWithUser extends Request {
  user: IUser;
}

export default IRequestWithUser;
