import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import { superAdminAuth } from "../../middleware/auth.middleware";
import grafanaApi from "../../GrafanaApi";
import CreateUserDto from "../user/interfaces/User.dto";
import {
	createGlobalUser,
	getGlobalUsers,
	getUserByProp,
	updateGlobalUser
} from "../user/userDAL";
import ItemNotFoundException from "../../exceptions/ItemNotFoundException";
import generateLastSeenAtAgeString from "../../utils/helpers/generateLastSeenAtAgeString";
import InvalidPropNameExeception from "../../exceptions/InvalidPropNameExeception";

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
				superAdminAuth,
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

	private getGlobalUsers = async (
		req: Request,
		res: Response,
		next: NextFunction
	): Promise<void> => {
		try {
			const users = await getGlobalUsers();
			users.forEach(user => {
				user.lastSeenAtAge = generateLastSeenAtAgeString(user);
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
			if (user.lastSeenAtAge) user.lastSeenAtAge = generateLastSeenAtAgeString(user);
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
			if (userData.password) {
				await this.grafanaRepository.changeUserPassword(existUser.id, userData.password);
			}
			const newUserData = { ...existUser, ...userData };
			await updateGlobalUser(newUserData);
			const message = { message: "User updated successfully" }
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