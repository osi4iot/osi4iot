import { Request } from "express";
import IUser from "../components/user/interfaces/User.interface";

interface IRequestWithUser extends Request {
  user: IUser;
}

export default IRequestWithUser;
