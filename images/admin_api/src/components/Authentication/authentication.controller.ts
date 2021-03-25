import { Router, NextFunction, Request, Response } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import HttpException from "../../exceptions/HttpException";
import IController from "../../interfaces/controller.interface";
import validationMiddleware from "../../middleware/validation.middleware";
import LoginDto from "./login.dto";
import CreateChangePasswordDto from "./changePassword.dto";
import IRequestWithUser from "../../interfaces/requestWithUser.interface";
import passportInitialize from "../../config/passportHandler";
import { userAuth, registerAuth } from "../../middleware/auth.middleware";
import grafanaApi from '../../GrafanaApi';
import UserRegisterDto from "./userRegister.dto";
import { updateOrganizationUser } from "../user/userDAL";
import groupExists from "../../middleware/groupExists.middleware";
import { haveThisUserGroupAdminPermissions } from "../group/groupDAL";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import CreateLongTermTokenDto from "./longTermToken.dto";


interface IJwtPayload {
	id: string;
	email: string;
	iat: number;
	exp: number;
}

interface ILoginOutput {
	accesToken: string;
}

class AuthenticationController implements IController {
	public path = "/auth";

	public router = Router();

	private grafanaRepository = grafanaApi;

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		passportInitialize();
		this.router.post(`${this.path}/login`, validationMiddleware<LoginDto>(LoginDto), this.userLogin);
		this.router.patch(`${this.path}/register`, registerAuth, validationMiddleware<UserRegisterDto>(UserRegisterDto), this.userRegister);
		this.router.patch(
			`${this.path}/change_password`,
			userAuth,
			validationMiddleware<CreateChangePasswordDto>(CreateChangePasswordDto),
			this.changePassword
		);

		this.router
			.post(
				`${this.path}/:groupId/long_term_token/`,
				groupExists,
				validationMiddleware<CreateLongTermTokenDto>(CreateLongTermTokenDto),
				this.longTermToken
			)
	}

	private userLogin = (req: Request, res: Response, next: NextFunction): void => {
		passport.authenticate(
			"local-login",
			{ session: false },
			async (err, user): Promise<Response | void> => {
				if (err || !user) {
					const errorMessage = "User credentials not correct.";
					return next(new HttpException(400, errorMessage));
				}

				const payload = {
					id: user.id,
					email: user.email,
					action: "access"
				};

				const algorithm = process.env.JWT_ALGORITHM as jwt.Algorithm;
				const accesToken = jwt.sign({ ...payload }, process.env.ACCESS_TOKEN_SECRET, {
					algorithm,
					expiresIn: parseInt(process.env.ACCESS_TOKEN_LIFETIME, 10)
				});

				try {
					const loginOutput: ILoginOutput = {
						accesToken
					};
					return res.status(200).json(loginOutput);
				} catch (error) {
					return next(error);
				}
			}
		)(req, res);
	};

	private userRegister = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { user } = req;
			const registerDto: UserRegisterDto = req.body;
			if (user.email !== registerDto.email) {
				const errorMessage = "The email indicated not match with the user email in database";
				throw new HttpException(400, errorMessage);
			}
			registerDto.userId = user.id;
			const { message } = await this.grafanaRepository.changeUserPassword(user.id, registerDto.password);
			await updateOrganizationUser(registerDto);

			if (message !== "User password updated") {
				const errorMessage = "The password could not be updated";
				throw new HttpException(400, errorMessage);
			} else {
				const okMessage = "User registered successfully";
				res.status(200).json({ message: okMessage });
			}
		} catch (error) {
			return next(error);
		}

	};

	private changePassword = async (req: IRequestWithUser, res: Response, next: NextFunction): Promise<void> => {
		const { user } = req;
		const { newPassword } = req.body;
		const { email } = user;
		const { message } = await this.grafanaRepository.changeUserPassword(user.id, newPassword);

		if (message !== "User password updated") {
			const errorMessage = `The password of user with email: ${email} could not be modified`;
			next(new HttpException(400, errorMessage));
		} else {
			const okMessage = `The password of the user with email: ${email} has been modified correctly`;
			res.status(200).json({ message: okMessage });
		}
	};

	private longTermToken = (req: IRequestWithGroup, res: Response, next: NextFunction): void => {
		const { tokenLifeTime } = req.body;
		passport.authenticate(
			"local-login",
			{ session: false },
			async (err, user): Promise<Response | void> => {
				if (err || !user) {
					const errorMessage = "User credentials not correct.";
					return next(new HttpException(400, errorMessage));
				}

				const orgId = req.group.orgId;
				const teamId = req.group.teamId;

				let isGroupAdmin = await haveThisUserGroupAdminPermissions(user.id, teamId, orgId);
				if (user.isGrafanaAdmin) isGroupAdmin = true;

				if (user && !isGroupAdmin) {
					return next(new HttpException(401, "You don't have group administrator privileges."));
				}

				const payload = {
					id: user.id,
					email: user.email,
					action: "access"
				};

				const algorithm = process.env.JWT_ALGORITHM as jwt.Algorithm;
				const accesToken = jwt.sign({ ...payload }, process.env.ACCESS_TOKEN_SECRET, {
					algorithm,
					expiresIn: parseInt(tokenLifeTime, 10)
				});

				try {
					const loginOutput: ILoginOutput = {
						accesToken
					};
					return res.status(200).json(loginOutput);
				} catch (error) {
					return next(error);
				}
			}
		)(req, res);
	};

}

export default AuthenticationController;
