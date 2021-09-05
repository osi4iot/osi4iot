import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { adminForSomeOrganizationAuth, superAdminAuth } from "../../middleware/auth.middleware";
import grafanaApi from "../../GrafanaApi";
import CreateUserDto from "../user/interfaces/User.dto";
import {
	createGlobalUser,
	createGlobalUsers,
	getGlobalUsers,
	getUserByProp,
	getUsersIdByEmailsArray,
	isUsersDataCorrect,
	updateGlobalUser
} from "../user/userDAL";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import generateLastSeenAtAgeString from "../../utils/helpers/generateLastSeenAtAgeString";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";
import { cleanEmailNotificationChannelForGroupsArray, getGroupsWhereUserIdIsMember } from "../group/groupDAL";
import CreateUsersArrayDto from "../user/interfaces/UsersArray.dto";
import CreateGlobalUsersArrayDto from "../user/interfaces/GlobalUsersArray.dto";
import HttpException from "../../exceptions/HttpException";

class ApplicationController implements IController {
	public path = "/application";

	public router = Router();

	private grafanaRepository = grafanaApi;

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(
				`${this.path}/statistics/`,
				superAdminAuth,
				this.getPlatformStatistics
			)
			.get(
				`${this.path}/global_users/`,
				adminForSomeOrganizationAuth,
				this.getGlobalUsers
			)
			.get(
				`${this.path}/global_user/:propName/:propValue`,
				superAdminAuth,
				this.getGlobalUserByProp
			)
			.delete(
				`${this.path}/global_user/:propName/:propValue`,
				superAdminAuth,
				this.deleteGlobalUserByProp
			)
			.patch(
				`${this.path}/global_user/:propName/:propValue`,
				superAdminAuth,
				validationMiddleware<CreateUserDto>(CreateUserDto, true),
				this.updateGlobalUserByProp
			)
			.post(
				`${this.path}/global_user/`,
				superAdminAuth,
				validationMiddleware<CreateUserDto>(CreateUserDto),
				this.createGlobalUser
			)
			.post(
				`${this.path}/global_users/`,
				superAdminAuth,
				validationMiddleware<CreateGlobalUsersArrayDto>(CreateGlobalUsersArrayDto),
				this.createGlobalUsers
			)
	}

	private getPlatformStatistics = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const statistics = await this.grafanaRepository.getPlatformStatistics();
			res.status(200).send(statistics);
		} catch (error) {
			next(error);
		}
	};

	private createGlobalUser = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const userData: CreateUserDto = req.body;
			let message: { message: string };
			const existUser = await getUserByProp("email", userData.email);
			if (!existUser) {
				await createGlobalUser(userData);
				message = { message: `A new global user has been created` };
			} else {
				message = { message: `The user with email: ${userData.email} already exist` };
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private createGlobalUsers = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const globalUsersData: CreateUserDto[] = req.body.users;
			const usersIdArray = await getUsersIdByEmailsArray(globalUsersData.map(user => user.email));
			const emailsArray = usersIdArray.map(user => user.email);
			const existingUserArray: CreateUserDto[] = [];
			globalUsersData.forEach(user => {
				const orgIndex = emailsArray.indexOf(user.email);
				if (orgIndex !== -1) {
					existingUserArray.push(user);
				}
			})
			const nonExistingUsersArray = globalUsersData.filter(user => emailsArray.indexOf(user.email) === -1);

			let message: { message: string };
			if (nonExistingUsersArray.length !== 0) {
				if (!(await isUsersDataCorrect(nonExistingUsersArray)))
					throw new HttpException(400, "The same values of name, login, email and / or telegramId of some of the users is already taken.")
				const msg_users = await createGlobalUsers(nonExistingUsersArray);
				const globalUsersCreated = msg_users.filter(msg => msg.message === "User created");
				const numNewGlobalUsers = globalUsersCreated.length;
				const numExistingUsers = existingUserArray.length;
				const numFailures = nonExistingUsersArray.length - numNewGlobalUsers;
				if (globalUsersData.length === numNewGlobalUsers) {
					message = { message: `${numNewGlobalUsers} new global users have been created.` };
				} else {
					if (numFailures === 0) {
						message = { message: `Only ${numNewGlobalUsers} new global users have been created but ${numExistingUsers} users already exist` };
					} else {
						message = { message: `Number of failures: ${numFailures}; new global users created: ${numNewGlobalUsers}; already existing users: ${numExistingUsers}` };
					}
				}

			} else {
				message = { message: `All the inputted users already exist` };
			}
			res.status(200).send(message);
		} catch (error) {
			next(error);
		}
	};

	private getGlobalUsers = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const users = await getGlobalUsers();
			users.forEach(user => {
				user.lastSeenAtAge = generateLastSeenAtAgeString(user.lastSeenAtAge);
			});
			res.status(200).send(users);
		} catch (error) {
			next(error);
		}
	};

	private getGlobalUserByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(propName);
			const user = await getUserByProp(propName, propValue);
			if (!user) throw new ItemNotFoundException("The user", propName, propValue);
			if (user.lastSeenAtAge) user.lastSeenAtAge = generateLastSeenAtAgeString(user.lastSeenAtAge);
			res.status(200).json(user);
		} catch (error) {
			next(error);
		}
	};

	private updateGlobalUserByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(propName);
			const userData: CreateUserDto = req.body;
			const existUser = await getUserByProp(propName, propValue);
			if (!existUser) throw new ItemNotFoundException("The user", propName, propValue);
			if (userData.password && userData.password !== "") {
				await this.grafanaRepository.changeUserPassword(existUser.id, userData.password);
			}
			const newUserData = { ...existUser, ...userData };
			await updateGlobalUser(newUserData);
			const message = { message: "Global user updated successfully" }
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private deleteGlobalUserByProp = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const { propName, propValue } = req.params;
			if (!this.isValidUserPropName(propName)) throw new InvalidPropNameExeception(propName);
			const user = await getUserByProp(propName, propValue);
			if (!user) throw new ItemNotFoundException("The user", propName, propValue);
			if (user.login.slice(-9) === "api_admin") {
				throw new HttpException(403, "An api admin user can not be deleted.")
			}
			const groupsArray = await getGroupsWhereUserIdIsMember(user.id);
			await cleanEmailNotificationChannelForGroupsArray(user.email, groupsArray);
			const message = await this.grafanaRepository.deleteGlobalUser(user.id);
			res.status(200).json(message);
		} catch (error) {
			next(error);
		}
	};

	private isValidUserPropName = (propName: string) => {
		const validPropName = ["id", "login", "email"];
		return validPropName.indexOf(propName) !== -1;
	}

}

export default ApplicationController;