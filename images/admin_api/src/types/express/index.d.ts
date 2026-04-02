import IUser from "../../components/user/interfaces/User.interface";

declare global {
	namespace Express {
		interface User extends IUser {}
	}
}